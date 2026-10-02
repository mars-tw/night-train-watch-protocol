"""Bounded local vision review with a strict verdict schema and no tool delegation."""
import base64
import json
from pathlib import Path
import urllib.request
import sys

if hasattr(sys.stdout,"reconfigure"): sys.stdout.reconfigure(encoding="utf-8")

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"docs/evidence/promo-v211"
SCHEMA={"type":"object","properties":{"verdict":{"type":"string","enum":["PASS","REJECT"]},"evidence":{"type":"string"},"issues":{"type":"array","items":{"type":"string"}}},"required":["verdict","evidence","issues"],"additionalProperties":False}

for kind in ("landscape","portrait"):
    picture=OUTPUT/f"{kind}-contact-sheet.jpg"
    image="data:image/jpeg;base64,"+base64.b64encode(picture.read_bytes()).decode("ascii")
    prompt=f"審查這份 {kind} 宣傳影片的時序抽幀。主角、遊戲車廂、繁體片名/字幕是否清楚正常？有無破圖、錯字、遮擋或不適合公開的重大問題？請用evidence具體描述至少兩格你看到的內容，再給PASS或REJECT。這是55秒正常UI實錄，動態全檔decode與聲音分析已另行檢查；不要冒稱看過完整動態或聽過配樂，不可委派工作，也不可要求外部服務。只審查圖像證據，無法判斷就REJECT。"
    request={"model":"qwen3.8-27b","messages":[{"role":"system","content":"你是本機影片內容终審者。只檢查傳入圖片，不使用工具，不委派，回傳指定JSON格式，必須根據可見證據回答。"},{"role":"user","content":[{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":image}}]}],"max_tokens":700,"temperature":0.1,"stream":False,"chat_template_kwargs":{"enable_thinking":False},"reasoning_effort":"none","response_format":{"type":"json_schema","json_schema":{"name":"film_quality_verdict","strict":True,"schema":SCHEMA}}}
    call=urllib.request.Request("http://127.0.0.1:1234/v1/chat/completions",data=json.dumps(request,ensure_ascii=False).encode("utf-8"),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(call,timeout=600) as response: answer=json.load(response)
    content=answer["choices"][0]["message"]["content"]
    try: verdict=json.loads(content)
    except json.JSONDecodeError: verdict={"verdict":"REJECT","evidence":content,"issues":["Local response was not valid verdict JSON"]}
    record={"kind":kind,"endpoint":"local LM Studio documented OpenAI-compatible endpoint","model":answer.get("model"),"usage":answer.get("usage"),"delegationEnabled":False,"image":picture.name,"judgment":verdict,"contentScope":"ordered contact-sheet visual inspection; full decode and audio measured separately"}
    (OUTPUT/f"local-{kind}-verdict.json").write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(record,ensure_ascii=False),flush=True)
