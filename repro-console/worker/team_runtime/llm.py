"""One chat-completions client for all six agents.

Every provider we target speaks the OpenAI-compatible dialect, so one key pointed at a
router drives six different models and the proposer/checker family separation survives.
Point an individual agent somewhere else with REPRO_BASE_URL_<AGENT> / REPRO_API_KEY_<AGENT>.

Set REPRO_LLM_PROVIDER=mock to exercise the whole runtime, gates and bus without keys.
"""
import json
import os
import time
import urllib.error
import urllib.request


class LLMError(Exception):
    pass


class OpenAICompatible:
    def __init__(self, base_url, api_key, model, temperature=0.0, timeout=120):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.timeout = timeout

    def complete(self, messages, tools, retries=3):
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "tools": tools,
            "tool_choice": "auto",
        }
        data = json.dumps(body).encode()
        last = None
        for attempt in range(retries):
            req = urllib.request.Request(
                f"{self.base_url}/chat/completions", data=data, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json",
                         "HTTP-Referer": "https://github.com/repro", "X-Title": "Repro"},
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    out = json.loads(res.read())
                if not out.get("choices"):
                    raise LLMError(f"{self.model}: no choices in response: {str(out)[:200]}")
                return out["choices"][0]["message"]
            except urllib.error.HTTPError as e:
                payload = e.read().decode(errors="replace")[:300]
                last = LLMError(f"{self.model} -> {e.code}: {payload}")
                if e.code in (400, 401, 403, 404):
                    raise last from None       # a bad key or model id will not fix itself
            except Exception as e:
                last = LLMError(f"{self.model}: {type(e).__name__}: {str(e)[:160]}")
            time.sleep(1.5 * (attempt + 1))
        raise last or LLMError(f"{self.model}: no response")


class Mock:
    """A scripted stand-in so the runtime, the gates and the bus can be tested without keys.

    This is a wiring harness, not a simulation of the agents. It replays a fixed sequence
    of tool calls per agent. Anything it produces is marked as coming from the mock.
    """

    def __init__(self, agent, script):
        self.agent = agent
        self.script = list(script)
        self.turn = 0

    def complete(self, messages, tools, retries=0):
        allowed = {t["function"]["name"] for t in tools}
        while self.script:
            step = self.script.pop(0)
            name, args = step["tool"], step.get("args", {})
            if name not in allowed:
                continue
            self.turn += 1
            return {"role": "assistant", "content": None, "tool_calls": [{
                "id": f"call_{self.agent}_{self.turn}", "type": "function",
                "function": {"name": name, "arguments": json.dumps(args)}}]}
        return {"role": "assistant", "content": None, "tool_calls": [{
            "id": f"call_{self.agent}_end", "type": "function",
            "function": {"name": "done", "arguments": json.dumps({"summary": "mock script exhausted"})}}]}


def client_for(agent, scripts=None):
    if os.environ.get("REPRO_LLM_PROVIDER") == "mock":
        return Mock(agent.name, (scripts or {}).get(agent.name, []))
    if not agent.api_key:
        raise LLMError(
            f"No API key for {agent.name}. Set REPRO_LLM_API_KEY (one router key for all six) "
            f"or REPRO_API_KEY_{agent.env_suffix}. Set REPRO_LLM_PROVIDER=mock to run the wiring without keys."
        )
    return OpenAICompatible(agent.base_url, agent.api_key, agent.model, agent.temperature)
