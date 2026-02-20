from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any

import httpx
from pydantic import ValidationError

from models import ReplyPayload
from settings import LLMSettings

OUTPUT_SCHEMA_HINT = """请严格输出一个 JSON 对象，字段必须完全匹配如下结构，不要输出任何额外文本：
{
  "peer_id": <number>,
  "session_type": "private" | "group",
  "sentiment": "positive" | "neutral" | "negative" | "urgent",
  "suggestions": [
    {
      "text": <string>,
      "tone": <string>,
      "intent": <string>,
      "notes": <string>
    }
  ]
}
约束：
1) suggestions 长度 1~3
2) suggestions[].text 必须可直接发送
3) 不能输出 markdown、代码块、解释文本
"""


class LLMClient:
    def __init__(self, settings: LLMSettings) -> None:
        self.api_base = settings.api_base
        self.api_key = settings.api_key
        self.model = settings.model
        self.timeout_seconds = settings.timeout_seconds
        self._url = f"{self.api_base.rstrip('/')}/chat/completions"

    async def generate(
        self,
        peer_id: int,
        session_type: str,
        latest_message: str,
        system_prompt: str,
        user_prompt: str,
    ) -> ReplyPayload:
        first_prompt = self._compose_user_prompt(user_prompt, strict_retry=False)
        retry_prompt = self._compose_user_prompt(user_prompt, strict_retry=True)

        try:
            payload = await self._generate_once(
                peer_id=peer_id,
                session_type=session_type,
                user_prompt=first_prompt,
                system_prompt=system_prompt,
            )
            payload = self._filter_echo_suggestions(payload, latest_message)
            if not payload.suggestions:
                raise ValueError("建议均与原消息重复")
            return payload
        except (ValidationError, ValueError, json.JSONDecodeError):
            payload = await self._generate_once(
                peer_id=peer_id,
                session_type=session_type,
                user_prompt=retry_prompt,
                system_prompt=system_prompt,
            )
            payload = self._filter_echo_suggestions(payload, latest_message)
            if not payload.suggestions:
                raise ValueError("重试后建议仍与原消息重复")
            return payload

    async def test_connection(self) -> str:
        if not self.api_base.strip():
            raise ValueError("LLM API Base 未配置")
        if not self.api_key.strip():
            raise ValueError("LLM API Key 未配置")
        if not self.model.strip():
            raise ValueError("LLM Model 未配置")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 32,
            "messages": [
                {"role": "system", "content": "你是连通性测试助手。"},
                {"role": "user", "content": "请只回复 pong"},
            ],
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(self._url, headers=headers, json=body)
            if not response.is_success:
                self._raise_provider_error(response)

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        text = content.strip() if isinstance(content, str) else ""
        if not text:
            raise ValueError("模型返回为空")
        return text[:120]

    async def _generate_once(
        self,
        peer_id: int,
        session_type: str,
        user_prompt: str,
        system_prompt: str,
    ) -> ReplyPayload:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages: list[dict[str, str]] = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        body: dict[str, Any] = {
            "model": self.model,
            "temperature": 0.7,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.post(self._url, headers=headers, json=body)
            except httpx.TimeoutException as exc:
                raise RuntimeError("请求LLM超时") from exc
            except httpx.RequestError as exc:
                raise RuntimeError(f"请求LLM失败: {exc.__class__.__name__}") from exc
            if response.status_code == 400:
                body_no_format = dict(body)
                body_no_format.pop("response_format", None)
                try:
                    retry_response = await client.post(self._url, headers=headers, json=body_no_format)
                except httpx.TimeoutException as exc:
                    raise RuntimeError("请求LLM超时") from exc
                except httpx.RequestError as exc:
                    raise RuntimeError(f"请求LLM失败: {exc.__class__.__name__}") from exc
                if retry_response.is_success:
                    response = retry_response
                else:
                    self._raise_provider_error(retry_response)
            elif not response.is_success:
                self._raise_provider_error(response)

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not isinstance(content, str):
            raise ValueError("模型返回内容类型无效，必须为字符串")

        text = content.strip()
        if not text:
            raise ValueError("模型返回为空")

        text = self._extract_json_object_text(text)
        try:
            payload_obj = json.loads(text)
        except Exception as exc:
            raise ValueError(
                "模型输出不是合法 JSON，请确保只输出 JSON 对象"
                f"；输出片段: {self._preview_output_text(text)}"
            ) from exc

        try:
            payload = ReplyPayload.model_validate(payload_obj)
        except ValidationError as exc:
            raise ValueError(
                "模型输出 JSON 结构不符合要求"
                f"；输出片段: {self._preview_output_text(text)}"
            ) from exc
        if payload.peer_id != peer_id:
            payload = payload.model_copy(update={"peer_id": peer_id})
        if payload.session_type != session_type:
            payload = payload.model_copy(update={"session_type": session_type})
        return payload

    @staticmethod
    def _compose_user_prompt(user_prompt: str, strict_retry: bool) -> str:
        suffix = "\n\n[输出格式要求]\n" + OUTPUT_SCHEMA_HINT
        if strict_retry:
            suffix += "\n[重试要求]\n上次输出不合规。仅输出 JSON 对象本体，不允许任何前后缀文本。"
        return user_prompt + suffix

    @staticmethod
    def _raise_provider_error(response: httpx.Response) -> None:
        body_text = response.text.strip()
        if len(body_text) > 800:
            body_text = body_text[:800] + "..."
        raise RuntimeError(f"LLM 服务返回异常（HTTP {response.status_code}）：{body_text or '空响应'}")

    @staticmethod
    def _preview_output_text(text: str, limit: int = 1024) -> str:
        compact = " ".join((text or "").split())
        if len(compact) > limit:
            return compact[:limit] + "..."
        return compact

    @classmethod
    def _extract_json_object_text(cls, text: str) -> str:
        raw = (text or "").strip()
        if not raw:
            return raw

        # Remove common wrappers such as markdown code fences and model control tags.
        cleaned = raw.replace("<|begin_of_box|>", "").replace("<|end_of_box|>", "").strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            cleaned = cleaned.strip()

        if cleaned.startswith("{") and cleaned.endswith("}"):
            return cleaned

        # Fallback: extract from first '{' to last '}'.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return cleaned[start : end + 1]
        return cleaned

    @staticmethod
    def _normalize_compare_text(text: str) -> str:
        t = re.sub(r"\s+", "", text or "").lower()
        t = re.sub(r"[^\u4e00-\u9fff0-9a-z]+", "", t)
        return t

    @classmethod
    def _is_echo_like(cls, suggestion_text: str, latest_message: str) -> bool:
        s = cls._normalize_compare_text(suggestion_text)
        m = cls._normalize_compare_text(latest_message)
        if not s or not m:
            return False
        if s == m:
            return True
        if len(s) >= 6 and s in m:
            return True
        if len(m) >= 8 and m in s and len(s) - len(m) <= 2:
            return True
        ratio = SequenceMatcher(None, s, m).ratio()
        if min(len(s), len(m)) >= 12:
            return ratio >= 0.92
        return ratio >= 0.96

    @classmethod
    def _filter_echo_suggestions(cls, payload: ReplyPayload, latest_message: str) -> ReplyPayload:
        kept = [item for item in payload.suggestions if not cls._is_echo_like(item.text, latest_message)]
        return payload.model_copy(update={"suggestions": kept})
