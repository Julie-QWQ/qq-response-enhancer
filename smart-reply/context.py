from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Hashable
from typing import Deque

from models import IncomingMessage

MAX_HISTORY = 30


class ContextStore:
    """In-memory chat context cache keyed by session key."""

    def __init__(self, max_history: int = MAX_HISTORY) -> None:
        self._max_history = max_history
        self._data: dict[Hashable, Deque[IncomingMessage]] = defaultdict(
            lambda: deque(maxlen=self._max_history)
        )

    def append(self, session_key: Hashable, message: IncomingMessage) -> None:
        self._data[session_key].append(message)

    def get(self, session_key: Hashable) -> list[IncomingMessage]:
        return list(self._data[session_key])

    def set_max_history(self, max_history: int) -> None:
        if max_history <= 0 or max_history == self._max_history:
            return
        self._max_history = max_history
        rebuilt: dict[Hashable, Deque[IncomingMessage]] = {}
        for key, items in self._data.items():
            new_deque: Deque[IncomingMessage] = deque(items, maxlen=self._max_history)
            rebuilt[key] = new_deque
        self._data = defaultdict(lambda: deque(maxlen=self._max_history), rebuilt)
