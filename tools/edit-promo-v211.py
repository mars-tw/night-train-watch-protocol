"""Edit genuine browser recordings into the open-source homepage trailer.

Requires ffmpeg/ffprobe and NumPy. No generated gameplay or checkpoint injection.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/video"
WORK = ROOT / "output/playwright/promo-v211/edit"


def run(args):
    subprocess.run(args, cwd=ROOT, check=True)


def stamp(seconds, ass=False):
    milliseconds = round(seconds * 1000)
    hour, milliseconds = divmod(milliseconds, 3600000)
    minute, milliseconds = divmod(milliseconds, 60000)
    second, milliseconds = divmod(milliseconds, 1000)
    return f"{hour}:{minute:02}:{second:02}.{milliseconds//10:02}" if ass else f"{hour:02}:{minute:02}:{second:02}.{milliseconds:03}"


def soundtrack(seconds):
    """Original quiet bell/pad score; not presented as recorded game audio."""
    rate = 48000
    count = int(np.ceil(seconds * rate))
    time = np.arange(count, dtype=np.float64) / rate
    signal = np.zeros(count)
    chords = [(220, 261.626, 329.628), (174.614, 220, 261.626), (146.832, 174.614, 220), (164.814, 195.998, 246.942)]
    for block in range(int(seconds // 8) + 1):
        begin = block * 8
        age = time - begin
        envelope = np.clip(age / 1.2, 0, 1) * np.clip((8.7 - age) / 1.5, 0, 1)
        for frequency in chords[block % len(chords)]:
            voice = np.sin(2*np.pi*frequency*time + .05*np.sin(2*np.pi*.17*time))
            voice += .16*np.sin(2*np.pi*frequency*2*time)
            signal += .015 * envelope * voice
        for beat, frequency in enumerate(chords[block % len(chords)]):
            pluck_age = time - (begin + .8 + beat * 1.6)
            pluck = np.exp(-np.maximum(pluck_age, 0)/1.2) * (pluck_age >= 0)
            signal += .013 * pluck * (np.sin(2*np.pi*frequency*2*time)+.22*np.sin(2*np.pi*frequency*4*time))
    signal += .003*np.sin(2*np.pi*55*time)
    signal *= np.clip(time/.8,0,1) * np.clip((seconds-time)/1.0,0,1)
    signal *= .18/max(float(np.max(np.abs(signal))), 1e-6)
    stereo = np.column_stack((signal, signal*.98))
    path = WORK / "original-promo-score.wav"
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(2); audio.setsampwidth(2); audio.setframerate(rate)
        audio.writeframes((np.clip(stereo,-1,1)*32767).astype("<i2").tobytes())
    return path


def ass_file(edl, portrait):
    width, height = (720,1280) if portrait else (1280,720)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Brand,Microsoft JhengHei,50,&H00E6F0FF,&H00E6F0FF,&H00121B20,&H00000000,-1,0,0,0,100,100,1,0,1,1.5,1,7,0,0,0,1
Style: Heading,Microsoft JhengHei,36,&H00BEE2F5,&H00BEE2F5,&H00121B20,&H00000000,-1,0,0,0,100,100,0,0,1,1.5,1,7,0,0,0,1
Style: Copy,Microsoft JhengHei,26,&H00DEE6E8,&H00DEE6E8,&H00121B20,&H00000000,0,0,0,0,100,100,0,0,1,1.2,1,7,0,0,0,1
Style: Small,Microsoft JhengHei,18,&H00C1CCC9,&H00C1CCC9,&H00121B20,&H00000000,0,0,0,0,100,100,0,0,1,1,1,7,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events=[]
    total=edl[-1]["outputEnd"]
    def event(start,end,style,text):
        events.append(f"Dialogue: 0,{stamp(start,True)},{stamp(end,True)},{style},,0,0,0,,{text}")
    if portrait:
        event(0,total,"Brand",r"{\an8\pos(360,18)\fs34}夜行列車：守夜協定")
        event(0,total,"Small",r"{\an2\pos(360,1268)\fs22}實際遊玩錄影 · GitHub 開源")
    else:
        event(0,total,"Brand",r"{\an7\pos(64,224)}夜行列車\N守夜協定")
        event(0,total,"Small",r"{\an7\pos(68,372)}NIGHT TRAIN\NWATCH PROTOCOL")
        event(0,total,"Copy",r"{\an7\pos(68,465)\fs23}五節車廂 · 三條七夜")
        event(0,total,"Small",r"{\an7\pos(68,545)}mars-tw.github.io/\Nnight-train-watch-protocol/")
        event(0,total,"Small",r"{\an2\pos(640,718)\fs16}實際遊玩錄影")
    for segment in edl:
        start,end=segment["outputStart"],segment["outputEnd"]
        if portrait:
            event(start,end,"Heading",r"{\an8\pos(360,66)\fs27\fad(100,100)}"+segment["heading"])
        else:
            event(start,end,"Heading",r"{\an7\pos(888,246)\fad(100,100)}"+segment["heading"])
            event(start,end,"Copy",r"{\an7\pos(888,335)\fad(100,100)}"+segment["copy"].replace("\n",r"\N"))
    path=WORK/("portrait.ass" if portrait else "landscape.ass")
    path.write_text(header+"\n".join(events)+"\n",encoding="utf-8-sig")
    return path.relative_to(ROOT).as_posix()


def export(edl,sources,audio,portrait=False):
    size=(720,1280) if portrait else (1280,720)
    phone_height=1120 if portrait else 680
    files=sorted(set(segment["source"] for segment in edl))
    source_indices={name:index for index,name in enumerate(files)}
    args=["ffmpeg","-hide_banner","-loglevel","warning","-y"]
    for name in files: args += ["-i",str(sources[name])]
    args += ["-i",str(audio)]
    graph=[]
    for i,segment in enumerate(edl):
        index=source_indices[segment["source"]]
        length=segment["out"]-segment["in"]
        graph.append(f"[{index}:v]trim=start={segment['in']}:duration={length},setpts=PTS-STARTPTS,fps=30,split=2[bg{i}][fg{i}]")
        graph.append(f"[bg{i}]scale={size[0]}:{size[1]}:force_original_aspect_ratio=increase,crop={size[0]}:{size[1]},boxblur=24:2,eq=brightness=-0.23:saturation=0.65[back{i}]")
        graph.append(f"[fg{i}]scale=-2:{phone_height}:flags=lanczos[front{i}]")
        graph.append(f"[back{i}][front{i}]overlay=(W-w)/2:(H-h)/2,setsar=1,settb=1/30[v{i}]")
    joins="".join(f"[v{i}]" for i in range(len(edl)))
    graph.append(f"{joins}concat=n={len(edl)}:v=1:a=0[assembled]")
    subtitles=ass_file(edl,portrait)
    graph.append(f"[assembled]subtitles=filename='{subtitles}',format=yuv420p[final]")
    total=edl[-1]["outputEnd"]
    graph.append(f"[{len(files)}:a]atrim=duration={total},asetpts=PTS-STARTPTS,loudnorm=I=-20:TP=-2:LRA=7[audio]")
    filename="night-train-promo-v211-portrait.mp4" if portrait else "night-train-promo-v211.mp4"
    destination=OUT/filename
    args += ["-filter_complex",";".join(graph),"-map","[final]","-map","[audio]","-c:v","libx264","-preset","medium","-crf","21","-maxrate","1400k" if portrait else "1300k","-bufsize","2800k","-c:a","aac","-b:a","96k","-ar","48000","-movflags","+faststart","-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709","-t",str(total),str(destination)]
    run(args)
    return destination


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--raw",required=True);parser.add_argument("--hero",required=True)
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
    sources={"playthrough":Path(args.raw).resolve(),"hero":Path(args.hero).resolve()}
    selections=[
        ("hero",4.136,9.136,"移動的小家","暖木、毛毯與燈火\n照亮守夜旅程"),
        ("playthrough",6.526,11.705,"照顧乘客","安撫、休息與照護\n每個行動都有取捨"),
        ("playthrough",12.214,21.643,"五節生活車廂","臥室、物資與工坊\n溫室、廚房各有用途"),
        ("playthrough",22.653,26.397,"種下明天","播種與灌溉\n把收成留給下一夜"),
        ("playthrough",27.466,31.911,"一碗熱食","確認成本，再動手\n照顧乘客的日常"),
        ("playthrough",32.721,36.021,"56項任務","從教學到七夜主線\n把成果收進旅程檔案"),
        ("playthrough",47.707,51.007,"選擇下一站","讀懂紙本路線\n決定燃料與風險"),
        ("playthrough",56.330,60.899,"窗外的危機","觀察威脅，再反制\n守住列車的這一夜"),
        ("playthrough",61.917,65.217,"迎向黎明","查看夜晚的結果\n重新整理移動的小家"),
        ("playthrough",66.983,76.815,"停站探索","觀察、工具與抉擇\n帶著物資安全撤回"),
        ("hero",9.136,12.147,"現在啟程","瀏覽器即可遊玩\n完整原始碼公開"),
    ]
    edl=[];position=0
    for source,begin,end,heading,copy in selections:
        duration=end-begin
        edl.append({"source":source,"in":begin,"out":end,"heading":heading,"copy":copy,"outputStart":round(position,3),"outputEnd":round(position+duration,3)})
        position+=duration
    audio=soundtrack(position)
    landscape=export(edl,sources,audio)
    portrait=export(edl,sources,audio,True)
    run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss","1.4","-i",str(landscape),"-frames:v","1","-q:v","2",str(OUT/"night-train-promo-v211-cover.jpg")])
    vtt="WEBVTT\n\n"+"\n".join(f"{i+1}\n{stamp(s['outputStart'])} --> {stamp(s['outputEnd'])}\n{s['heading']}。{s['copy'].replace(chr(10),'，')}。\n" for i,s in enumerate(edl))
    (OUT/"night-train-promo-v211.zh-Hant.vtt").write_text(vtt,encoding="utf-8")
    report={"durationSeconds":round(position,3),"gameplaySpeed":1,"sources":{name:{"path":path.relative_to(ROOT).as_posix(),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()} for name,path in sources.items()},"shots":edl,"audio":{"origin":"original score synthesized by edit-promo-v211.py; not recorded in-game audio","license":"CC0-1.0"},"exports":[]}
    for path in (landscape,portrait):
        probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(path)]))
        report["exports"].append({"file":path.relative_to(ROOT).as_posix(),"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"probe":probe})
    (WORK/"edit-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"durationSeconds":report["durationSeconds"],"files":[item["file"] for item in report["exports"]]},ensure_ascii=False))


if __name__=="__main__": main()
