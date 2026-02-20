from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IncomingMessage(BaseModel):
    """A single cached message entry used for prompt context."""

    role: Literal["user", "assistant"]
    text: str


class OneBotEvent(BaseModel):
    """Minimal OneBot 11 event model for message handling."""

    model_config = ConfigDict(extra="allow")

    post_type: str
    message_type: str | None = None
    user_id: int | None = None
    self_id: int | None = None
    message: str | list[dict[str, Any]] | None = None
    raw_message: str | None = None


class SuggestionItem(BaseModel):
    text: str
    tone: str
    intent: str
    notes: str


class ReplyPayload(BaseModel):
    peer_id: int
    session_type: Literal["private", "group"] = "private"
    sentiment: Literal["positive", "neutral", "negative", "urgent"]
    suggestions: list[SuggestionItem] = Field(min_length=1, max_length=3)


class EventResponse(BaseModel):
    status: Literal["ok", "ignored", "error"]
    processed: bool
    detail: str | None = None
