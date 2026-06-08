"""한국어 TTS — Microsoft Edge Neural Voice (edge-tts)."""

from __future__ import annotations

import edge_tts

# 공손·차분한 남성 음성 — 심사위원 톤에 적합
DEFAULT_VOICE = "ko-KR-InJoonNeural"
DEFAULT_RATE = "+34%"
DEFAULT_PITCH = "-1Hz"


async def synthesize_speech_async(
    text: str,
    *,
    voice: str = DEFAULT_VOICE,
    rate: str = DEFAULT_RATE,
    pitch: str = DEFAULT_PITCH,
) -> bytes:
    """텍스트를 MP3 바이트로 합성."""
    communicate = edge_tts.Communicate(
        text.strip(),
        voice=voice,
        rate=rate,
        pitch=pitch,
    )
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    if not chunks:
        raise RuntimeError("음성 데이터가 비어 있습니다.")
    return b"".join(chunks)
