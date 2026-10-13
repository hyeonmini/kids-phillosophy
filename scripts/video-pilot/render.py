"""Render the deterministic SVG timeline to a captioned, 90-second MP4.

Requires Python Playwright, Chromium, FFmpeg, NumPy, and Noto Sans CJK KR.
All rendering and sound synthesis are local; no media or speech API is used.
"""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import wave

import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
FPS = 24
DURATION = 90


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def timeline():
    result = subprocess.run(
        ['node', '--input-type=module', '-e',
         'import { cues, scenes } from "./scripts/video-pilot/scene-data.mjs"; '
         'console.log(JSON.stringify({cues,scenes}));'],
        cwd=PROJECT, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def timestamp(seconds, comma=False):
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    secs, millis = divmod(remainder, 1000)
    return f'{hours:02}:{minutes:02}:{secs:02}{"," if comma else "."}{millis:03}'


def make_sound(path):
    rate = 24000
    track = np.zeros(rate * DURATION, dtype=np.float64)

    def chime(start, frequency, length=.7, gain=.08):
        times = np.arange(round(length * rate)) / rate
        signal = (np.sin(2*np.pi*frequency*times)
                  + .23*np.sin(2*np.pi*frequency*2*times))
        envelope = np.minimum(times/.025, 1) * np.exp(-times*5)
        offset = round(start*rate)
        count = min(len(signal), len(track)-offset)
        track[offset:offset+count] += gain*signal[:count]*envelope[:count]

    # Original, sparse bell cues. The last scene has room to think quietly.
    for start in (0,10,22,34,46,58,70,80):
        chime(start+.12, 523.25)
        chime(start+.34, 659.25, gain=.055)
    for i in range(10):
        chime(70.1+i*.13, 783.99, length=.32, gain=.026)
    for start in range(2,76,4):
        for step, frequency in enumerate((261.63,329.63,392,329.63)):
            chime(start+step*.35,frequency,length=.6,gain=.013)
    peak = float(np.max(np.abs(track)))
    if peak > .8:
        track *= .8/peak
    with wave.open(str(path),'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes((np.clip(track,-1,1)*32767).astype('<i2').tobytes())


def render(output_dir, samples_only=False):
    data = timeline()
    output_dir.mkdir(parents=True,exist_ok=True)
    cues = data['cues']
    vtt = 'WEBVTT\n\n' + '\n\n'.join(
        f'{timestamp(start)} --> {timestamp(end)}\n{text}'
        for start,end,text in cues) + '\n'
    srt = '\n\n'.join(
        f'{i}\n{timestamp(start,True)} --> {timestamp(end,True)}\n{text}'
        for i,(start,end,text) in enumerate(cues,1)) + '\n'
    (output_dir/'pilot-01.vtt').write_text(vtt,encoding='utf-8')
    (output_dir/'pilot-01.srt').write_text(srt,encoding='utf-8')
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    server_thread = threading.Thread(target=server.serve_forever,daemon=True)
    server_thread.start()
    encoder = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=shutil.which('chromium'),
                                                 args=['--no-sandbox'])
            page = browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
            page.wait_for_function('window.rendererReady === true')
            page.evaluate('document.fonts.ready')
            samples_dir=PROJECT/'test-results'/'video-pilot'
            samples_dir.mkdir(parents=True,exist_ok=True)
            for i,scene in enumerate(data['scenes']):
                page.evaluate('(t) => window.renderFrame(t)',scene['start']+7)
                page.screenshot(path=str(samples_dir/f'scene-{i+1:02}.jpg'),type='jpeg',quality=94)
            page.evaluate('(t) => window.renderFrame(t)',7.5)
            page.screenshot(path=str(output_dir/'pilot-01-poster.jpg'),type='jpeg',quality=94)
            if samples_only:
                print(json.dumps({'samples':str(samples_dir),'errors':errors},ensure_ascii=False),flush=True)
                browser.close()
                return
            with tempfile.TemporaryDirectory(prefix='question-club-video-') as scratch:
                scratch=Path(scratch)
                sound=scratch/'sound.wav'
                make_sound(sound)
                silent=scratch/'silent.mp4'
                encoder=subprocess.Popen([
                    'ffmpeg','-hide_banner','-loglevel','error','-y',
                    '-f','image2pipe','-vcodec','mjpeg','-framerate',str(FPS),'-i','pipe:0',
                    '-an','-c:v','libx264','-preset','fast','-crf','24',
                    '-pix_fmt','yuv420p','-threads','2',str(silent),
                ],stdin=subprocess.PIPE)
                for frame in range(DURATION*FPS):
                    page.evaluate('(t) => window.renderFrame(t)',frame/FPS)
                    encoder.stdin.write(page.screenshot(type='jpeg',quality=93))
                    if frame%(FPS*10)==0:
                        print(f'Rendered {frame/FPS:.0f}/{DURATION}s',flush=True)
                encoder.stdin.close()
                if encoder.wait()!=0:
                    raise RuntimeError('FFmpeg video encoder failed')
                subprocess.run([
                    'ffmpeg','-hide_banner','-loglevel','error','-y',
                    '-i',str(silent),'-i',str(sound),'-map','0:v:0','-map','1:a:0',
                    '-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart',
                    '-metadata','title=물음표 클럽 · 상금 10만 원 · 90초 파일럿',
                    '-metadata','comment=한국어 자막과 직접 합성한 효과음. 내레이션 제작 전.',
                    '-t',str(DURATION),str(output_dir/'pilot-01.mp4'),
                ],check=True)
            browser.close()
            if errors:
                raise RuntimeError('; '.join(errors))
            print(json.dumps({'mp4':str(output_dir/'pilot-01.mp4'),
                              'duration':DURATION,'fps':FPS,'frames':DURATION*FPS,
                              'resolution':'1280x720','narration':False,'page_errors':errors},
                             ensure_ascii=False),flush=True)
    finally:
        if encoder is not None and encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        server.shutdown()
        server.server_close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=PROJECT/'public/assets/video')
    parser.add_argument('--samples-only',action='store_true')
    options=parser.parse_args()
    render(options.output.resolve(),options.samples_only)
