"""Run against the existing dev server with Python Playwright and system Chromium.

Example: python tests/browser_smoke.py --base-url http://127.0.0.1:3000
The test closes its browser; it never starts or stops the dev server.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


REFLECTION = "보이지 않는 테스트와 접근성 작업도 기여라는 점을 알게 되었어."
FIRST_REASON = "각자의 기여를 생각했어"
FINAL_REASON = "함께 만든 팀이라는 점을 생각했어"


def is_expected_media_abort(request):
    return (request.resource_type == "media"
            and request.failure == "net::ERR_ABORTED"
            and urlparse(request.url).path.endswith("/pilot-01.mp4"))


def assert_no_overflow(page, label, measurements):
    dimensions = page.evaluate("""() => ({
      inner_width: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    })""")
    dimensions["viewport"] = page.viewport_size["width"]
    measurements.append({"page": label, **dimensions})
    assert dimensions["document"] <= dimensions["viewport"], (label, dimensions)
    assert dimensions["body"] <= dimensions["viewport"], (label, dimensions)


def screenshot(page, directory, name):
    page.screenshot(path=str(directory / name), full_page=True, animations="disabled")


def open_nav(page, route):
    page.locator(f"nav a[href='#{route}']").click()
    expect(page).to_have_url(re.compile(f"/#{re.escape(route)}$"))


def expect_step(page, label):
    expect(page.locator(".step-track .current small")).to_have_text(label)


def check_pilot_video(page, playback=True):
    video = page.locator("#pilot-video")
    expect(video).to_be_visible()
    expect(video).to_have_attribute("controls", "")
    expect(video).to_have_attribute("playsinline", "")
    expect(video).to_have_attribute("preload", "metadata")
    assert video.get_attribute("autoplay") is None
    assert video.get_attribute("autoload") is None
    assert video.get_attribute("poster")
    expect(video.locator("track")).to_have_attribute("srclang", "ko")
    assert video.locator("track").get_attribute("default") is None
    expect(page.locator("#pilot-description")).to_have_text(
        "90초 모션 웹툰 파일럿 · 한국어 자막·효과음 · 내레이션은 제작 전")
    expect(page.locator(".pilot-resources a")).to_have_count(2)
    transcript_url = page.locator(".pilot-resources a").first.evaluate("link => link.href")
    transcript = page.context.request.get(transcript_url)
    assert transcript.status == 200
    assert "90초" in transcript.text()
    page.wait_for_function("""() => {
      const video = document.querySelector('#pilot-video');
      return video && Number.isFinite(video.duration) && video.readyState >= 1;
    }""", timeout=30000)
    metadata = video.evaluate("video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, paused: video.paused })")
    assert 89 <= metadata["duration"] <= 91, metadata
    assert metadata["width"] > 0 and metadata["height"] > 0, metadata
    assert metadata["paused"], "The pilot must wait for the viewer to start it."
    assert video.evaluate("video => !video.error"), "Video metadata failed."

    captions_url = video.locator("track").evaluate("track => track.src")
    captions = page.context.request.get(captions_url)
    assert captions.status == 200
    assert captions.text().lstrip().startswith("WEBVTT")

    if playback:
        page.evaluate("""async () => {
          const video = document.querySelector('#pilot-video');
          video.muted = true;
          await video.play();
        }""")
        page.wait_for_function("""() => {
          const video = document.querySelector('#pilot-video');
          return video.currentTime > 0.2 && video.getVideoPlaybackQuality().totalVideoFrames > 0;
        }""", timeout=15000)
        page.evaluate("""() => {
          const video = document.querySelector('#pilot-video');
          video.pause();
          video.currentTime = 30;
        }""")
        page.wait_for_function("""() => {
          const video = document.querySelector('#pilot-video');
          return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - 30) < 0.5;
        }""", timeout=15000)
        page.evaluate("document.querySelector('#pilot-video').play()")
        page.wait_for_function("document.querySelector('#pilot-video').currentTime > 30.2", timeout=15000)
        metadata["decoded_frames"] = video.evaluate("video => video.getVideoPlaybackQuality().totalVideoFrames")
        metadata["seeked_to"] = video.evaluate("video => video.currentTime")
        page.evaluate("""() => {
          const video = document.querySelector('#pilot-video');
          video.pause();
          video.currentTime = 0;
          video.muted = false;
        }""")
        page.wait_for_function("!document.querySelector('#pilot-video').seeking", timeout=15000)
    assert video.evaluate("video => !video.error"), "Video playback or seeking failed."
    return metadata


def run_story(page, screenshots=None, measurements=None, prefix="desktop"):
    page.locator(".empty-notes [data-action='start']").click()
    expect_step(page, "사건 만나기")
    pilot_metadata = check_pilot_video(page)
    if screenshots:
        screenshot(page, screenshots, f"{prefix}-episode-story.png")
    if measurements is not None:
        assert_no_overflow(page, "episode-story", measurements)

    page.locator("#next-step").click()
    expect_step(page, "첫 선택")
    expect(page.locator("#next-step")).to_be_disabled()
    for index, count in enumerate([5, 3, 2]):
        for _ in range(count):
            page.locator(f"#plus-{index}").click()
    expect(page.locator("#remaining-count")).to_have_text("0")
    expect(page.locator("#next-step")).to_be_disabled()
    for index, count in enumerate([5, 3, 2]):
        expect(page.locator(f"#amount-{index}")).to_have_text(str(count))
        expect(page.locator(f"#plus-{index}")).to_be_disabled()
    page.locator("#reason-0").click()
    expect(page.locator("#reason-text")).to_have_value(FIRST_REASON)
    expect(page.locator("#next-step")).to_be_enabled()
    if screenshots:
        screenshot(page, screenshots, f"{prefix}-episode-first-choice.png")
    if measurements is not None:
        assert_no_overflow(page, "episode-first-choice", measurements)

    page.locator("#next-step").click()
    expect_step(page, "숨은 이야기")
    expect(page.locator("#next-step")).to_be_disabled()
    for index in range(3):
        page.locator(f"#reveal-{index}").click()
        expect(page.locator(f"#reveal-{index}")).to_have_attribute("aria-expanded", "true")
    expect(page.locator("#next-step")).to_be_enabled()
    expect(page.locator("#reveal-2")).to_contain_text("버그 8개")
    if measurements is not None:
        assert_no_overflow(page, "episode-reveals", measurements)

    page.locator("#next-step").click()
    expect_step(page, "다른 관점")
    expect(page.locator("#next-step")).to_be_disabled()
    page.locator("#perspective-0").click()
    page.locator("#perspective-1").click()
    expect(page.locator("#perspective-1")).to_have_attribute("aria-selected", "true")
    expect(page.locator("#perspective-panel")).to_contain_text("친한 사람에게 마음이 기울었을까?")
    expect(page.locator("#next-step")).to_be_enabled()
    page.locator("#perspective-panel summary").click()
    expect(page.locator("#perspective-panel details")).to_have_attribute("open", "")
    expect(page.locator("#perspective-panel")).to_contain_text("『묵자』")
    if screenshots:
        screenshot(page, screenshots, f"{prefix}-episode-perspective.png")
    if measurements is not None:
        assert_no_overflow(page, "episode-perspectives", measurements)

    page.locator("#next-step").click()
    expect_step(page, "다시 선택")
    for _ in range(2):
        page.locator("#minus-0").click()
    for _ in range(2):
        page.locator("#plus-2").click()
    for index, count in enumerate([3, 3, 4]):
        expect(page.locator(f"#amount-{index}")).to_have_text(str(count))
    page.locator("#reason-1").click()
    expect(page.locator("#reason-text")).to_have_value(FINAL_REASON)
    if measurements is not None:
        assert_no_overflow(page, "episode-final-choice", measurements)

    page.locator("#next-step").click()
    expect_step(page, "생각 노트")
    page.locator("#reflection").fill(REFLECTION)
    page.locator("#save-note").click()
    expect(page.locator("#reflection")).to_have_value(REFLECTION)
    if screenshots:
        screenshot(page, screenshots, f"{prefix}-episode-reflection.png")
    if measurements is not None:
        assert_no_overflow(page, "episode-reflection", measurements)
    return pilot_metadata


def check_download(page, output_directory, action="download-note", filename="note-download.md"):
    with page.expect_download() as download_info:
        page.locator(f"[data-action='{action}']").click()
    download = download_info.value
    assert download.failure() is None, download.failure()
    assert download.suggested_filename.startswith("물음표클럽-생각노트-")
    assert download.suggested_filename.endswith(".md")
    destination = output_directory / filename
    download.save_as(destination)
    text = destination.read_text(encoding="utf-8")
    for required in ["1칩 = 1만 원", "지우 · 코드: 5칩", "지우 · 코드: 3칩",
                     "민호 · 테스트·홍보: 4칩", FIRST_REASON, FINAL_REASON, REFLECTION]:
        assert required in text, required


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--output", default="test-results")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    origin = urlparse(base_url)
    assert origin.hostname in {"127.0.0.1", "localhost", "::1"}, "Use a local dev server."
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    failures = []
    media_cancellations = []
    measurements = []
    results = []
    pilot_metadata = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=args.chromium,
            headless=True,
            args=["--disable-dev-shm-usage"],
        )
        try:
            def new_context(**options):
                context = browser.new_context(accept_downloads=True, locale="ko-KR", **options)
                context.route("**/*", lambda route: route.continue_()
                              if urlparse(route.request.url).netloc == origin.netloc
                              else route.abort())
                return context

            def observe(page, label):
                page.on("pageerror", lambda error: errors.append(f"{label}: {error}"))
                page.on("console", lambda message: errors.append(f"{label}: {message.text}")
                        if message.type == "error" else None)
                def request_failed(request):
                    destination = media_cancellations if is_expected_media_abort(request) else failures
                    destination.append(f"{label}: {request.url}: {request.failure}")
                page.on("requestfailed", request_failed)

            desktop_context = new_context(viewport={"width": 1440, "height": 1000})
            page = desktop_context.new_page()
            observe(page, "desktop")
            response = page.goto(base_url, wait_until="networkidle")
            assert response.status == 200
            expect(page.locator("#hero-title")).to_contain_text("생각해?")
            expect(page.locator(".topic-card")).to_have_count(8)
            screenshot(page, output, "desktop-home.png")
            results.append("desktop home")

            for index in range(8):
                title = page.locator(f".topic-card[data-index='{index}'] h3").inner_text()
                page.locator(f".topic-card[data-index='{index}']").click()
                expect(page.locator("#detail-dialog")).to_be_visible()
                expect(page.locator("#dialog-title")).to_have_text(title)
                expect(page.locator(".topic-episodes li")).to_have_count(2)
                if index == 3:
                    expect(page.locator("#detail-dialog")).to_contain_text("지금 체험할 수 있어")
                    screenshot(page, output, "desktop-roadmap-topic.png")
                page.locator("#detail-dialog .icon-button[data-action='close']").click()
                expect(page.locator("#detail-dialog")).not_to_be_visible()
            results.append("8 roadmap topic dialogs")

            open_nav(page, "library")
            expect(page.locator(".library-card")).to_have_count(3)
            for index, source in enumerate(["1131a–1131b", "「겸애」", "꾸란 2장 177절"]):
                page.locator(f".library-card [data-action='source'][data-index='{index}']").click()
                expect(page.locator("#detail-dialog")).to_be_visible()
                expect(page.locator(".source-detail")).to_contain_text("원전 위치")
                expect(page.locator(".source-detail")).to_contain_text(source)
                page.locator("#detail-dialog .icon-button[data-action='close']").click()
            screenshot(page, output, "desktop-library.png")
            results.append("3 library source dialogs")

            for path, required in [
                ("episode-01.md", "## 본편 대본"),
                ("editorial-guide.md", "출처"),
                ("content-roadmap.md", "로드맵"),
            ]:
                doc = desktop_context.request.get(f"{base_url}/docs/{path}")
                assert doc.status == 200, (path, doc.status)
                text = doc.text()
                assert required in text, (path, required)
                assert len(text) > 500, path
            results.append("3 documentation HTTP routes, including production script")

            open_nav(page, "notes")
            expect(page.locator(".empty-notes")).to_be_visible()
            expect(page.locator("#note-count")).to_be_hidden()
            screenshot(page, output, "desktop-empty-notes.png")
            results.append("empty note state")

            pilot_metadata["desktop"] = run_story(page, output)
            expect(page.locator("#status-message")).to_contain_text("저장했어")
            raw_notes = page.evaluate("JSON.parse(localStorage.getItem('question-club-notes-v1'))")
            assert len(raw_notes) == 1
            assert raw_notes[0]["initial"] == [5, 3, 2]
            assert raw_notes[0]["final"] == [3, 3, 4]
            assert raw_notes[0]["reflection"] == REFLECTION
            open_nav(page, "notes")
            page.reload(wait_until="networkidle")
            expect(page.locator(".saved-note")).to_have_count(1)
            expect(page.locator(".saved-reflection")).to_contain_text(REFLECTION)
            expect(page.locator("#note-count")).to_have_text("1")
            screenshot(page, output, "desktop-saved-note.png")
            check_download(page, output)
            page.locator("[data-action='delete-confirm']").click()
            expect(page.locator("#detail-dialog")).to_be_visible()
            page.locator("[data-action='delete-note']").click()
            expect(page.locator(".empty-notes")).to_be_visible()
            assert page.evaluate("JSON.parse(localStorage.getItem('question-club-notes-v1'))") == []
            page.reload(wait_until="networkidle")
            expect(page.locator(".empty-notes")).to_be_visible()
            results.append("90-second pilot metadata, decoded playback and seeking; six-step story, save, reload restore, Markdown download, deletion")

            mobile_context = new_context(viewport={"width": 390, "height": 844},
                                         is_mobile=True, device_scale_factor=1, has_touch=True)
            mobile = mobile_context.new_page()
            observe(mobile, "mobile")
            mobile.goto(base_url, wait_until="networkidle")
            expect(mobile.locator("#hero-title")).to_be_visible()
            assert_no_overflow(mobile, "home", measurements)
            screenshot(mobile, output, "mobile-home.png")
            for index in range(8):
                mobile.locator(f".topic-card[data-index='{index}']").click()
                expect(mobile.locator("#detail-dialog")).to_be_visible()
                assert_no_overflow(mobile, f"topic-dialog-{index}", measurements)
                mobile.locator("#detail-dialog .icon-button[data-action='close']").click()
            open_nav(mobile, "library")
            expect(mobile.locator(".library-card")).to_have_count(3)
            assert_no_overflow(mobile, "library", measurements)
            screenshot(mobile, output, "mobile-library.png")
            mobile.locator(".library-card [data-action='source'][data-index='2']").click()
            expect(mobile.locator("#detail-dialog")).to_be_visible()
            assert_no_overflow(mobile, "library-source-dialog", measurements)
            mobile.locator("#detail-dialog .icon-button[data-action='close']").click()
            open_nav(mobile, "notes")
            expect(mobile.locator(".empty-notes")).to_be_visible()
            assert_no_overflow(mobile, "empty-notes", measurements)
            pilot_metadata["mobile"] = run_story(mobile, output, measurements, "mobile")
            open_nav(mobile, "notes")
            expect(mobile.locator(".saved-note")).to_have_count(1)
            assert_no_overflow(mobile, "saved-notes", measurements)
            screenshot(mobile, output, "mobile-saved-note.png")
            results.append("390px mobile routes, dialogs and all six story stages without horizontal overflow")

            blocked_context = new_context(viewport={"width": 1280, "height": 900})
            blocked_context.add_init_script("""Object.defineProperty(window, 'localStorage', {
              get() { throw new DOMException('Test: storage denied', 'SecurityError'); }
            });""")
            blocked = blocked_context.new_page()
            observe(blocked, "storage-denied")
            blocked.goto(f"{base_url}/#notes", wait_until="networkidle")
            expect(blocked.locator(".empty-notes")).to_be_visible()
            pilot_metadata["storage_denied"] = run_story(blocked)
            expect(blocked.locator("#status-message")).to_contain_text("브라우저에 저장할 수 없었어")
            open_nav(blocked, "notes")
            expect(blocked.locator(".saved-note")).to_have_count(1)
            expect(blocked.locator(".saved-reflection")).to_contain_text(REFLECTION)
            check_download(blocked, output, filename="storage-denied-download.md")
            screenshot(blocked, output, "storage-denied-session-note.png")
            blocked.reload(wait_until="networkidle")
            expect(blocked.locator(".empty-notes")).to_be_visible()
            results.append("blocked localStorage: session note remains readable/downloadable; refresh loses session")

            assert not errors, errors
            assert not failures, failures
            results.append("zero browser console errors, uncaught errors and failed requests")
            report = {"passed": results, "mobile_widths": measurements,
                      "console_errors": errors, "failed_requests": failures,
                      "media_cancellations": media_cancellations,
                      "pilot_metadata": pilot_metadata}
            (output / "browser-report.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        except Exception:
            for context_index, context in enumerate(browser.contexts):
                for index, existing_page in enumerate(context.pages):
                    try:
                        screenshot(existing_page, output, f"failure-{context_index}-{index}.png")
                    except Exception:
                        pass
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
