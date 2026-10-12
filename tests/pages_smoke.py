"""Check a GitHub Pages project path locally or against the published site.

Build first, then run `python tests/pages_smoke.py` for /kids-phillosophy/.
For the published site, use:
  python tests/pages_smoke.py --base-url https://hyeonmini.github.io/kids-phillosophy/
Only the temporary server created by this test is stopped on exit.
"""

import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import sys
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
from browser_smoke import REFLECTION, assert_no_overflow, open_nav, run_story, screenshot


WRAPPER = r"""
import { createServer } from 'node:http';
import { createStaticServer } from './scripts/server.mjs';
const prefix = '/kids-phillosophy';
const files = createStaticServer({ rootDir: 'dist', docsDir: 'dist/docs' });
const serve = files.listeners('request')[0];
const server = createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0];
  if (pathname === prefix) {
    res.writeHead(308, { Location: `${prefix}/` });
    res.end();
    return;
  }
  if (!pathname.startsWith(`${prefix}/`)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found outside project path\n');
    return;
  }
  req.url = req.url.slice(prefix.length);
  serve.call(files, req, res);
});
server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ base_url: `http://127.0.0.1:${server.address().port}${prefix}/` }));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
"""


def start_project_server(project):
    assert (project / "dist/index.html").is_file(), "Run npm run build before this test."
    server = subprocess.Popen(
        ["node", "--input-type=module", "-e", WRAPPER],
        cwd=project,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        ready, _, _ = select.select([server.stdout], [], [], 10)
        assert ready, "Temporary project server did not become ready within 10 seconds."
        line = server.stdout.readline()
        assert line, server.stderr.read() if server.poll() is not None else "Server exited."
        return server, json.loads(line)["base_url"]
    except Exception:
        stop_project_server(server)
        raise


def stop_project_server(server):
    if server is None:
        return
    if server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
    if server.stdout:
        server.stdout.close()
    if server.stderr:
        server.stderr.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Published project URL; skips the local wrapper.")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--output", default="test-results/pages")
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    server = None
    browser = None
    report = {"passed": [], "console_errors": [], "failed_requests": [],
              "resource_errors": [], "outside_project_requests": [], "mobile_widths": []}
    try:
        if args.base_url:
            base_url = args.base_url.rstrip("/") + "/"
        else:
            server, base_url = start_project_server(project)
        origin = urlparse(base_url)
        assert origin.scheme in {"http", "https"} and origin.netloc
        assert origin.path == "/kids-phillosophy/", "Use the /kids-phillosophy/ project URL."
        report["base_url"] = base_url

        with sync_playwright() as playwright:
            launch_options = {"executable_path": args.chromium, "headless": True,
                              "args": ["--disable-dev-shm-usage"]}
            if origin.hostname not in {"127.0.0.1", "localhost", "::1"}:
                proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
                if proxy:
                    launch_options["proxy"] = {"server": proxy}
            browser = playwright.chromium.launch(**launch_options)

            def observe(page):
                page.on("pageerror", lambda error: report["console_errors"].append(str(error)))
                page.on("console", lambda message: report["console_errors"].append(message.text)
                        if message.type == "error" else None)
                page.on("requestfailed", lambda request: report["failed_requests"].append(
                    {"url": request.url, "error": request.failure}))

                def check_response(response):
                    if response.status >= 400:
                        report["resource_errors"].append({"url": response.url, "status": response.status})
                    if urlparse(response.url).path.startswith(origin.path) is False:
                        report["outside_project_requests"].append(response.url)

                page.on("response", check_response)

            def context(**options):
                result = browser.new_context(locale="ko-KR", accept_downloads=True, **options)
                result.route("**/*", lambda route: route.continue_()
                             if urlparse(route.request.url).netloc == origin.netloc else route.abort())
                result.on("page", observe)
                return result

            desktop = context(viewport={"width": 1440, "height": 1000})
            if server:
                for bare_path in ["/", "/index.html", "/app.js", "/style.css", "/assets/prize.svg"]:
                    response = desktop.request.get(f"{origin.scheme}://{origin.netloc}{bare_path}")
                    assert response.status == 404, (bare_path, response.status)
                report["passed"].append("wrapper rejects bare root asset paths with HTTP 404")

            page = desktop.new_page()
            response = page.goto(base_url, wait_until="networkidle")
            assert response.status == 200, (response.url, response.status)
            expect(page.locator("#hero-title")).to_contain_text("생각해?")
            expect(page.locator(".topic-card")).to_have_count(8)
            assert page.evaluate("""() => [...document.images].every(image =>
                image.complete && image.naturalWidth > 0)"""), "A home illustration failed to load."
            assert page.locator("script[type='module']").evaluate("script => script.src").startswith(base_url)
            assert page.locator("link[rel='stylesheet']").evaluate("link => link.href").startswith(base_url)
            screenshot(page, output, "project-desktop-home.png")
            report["passed"].append("entry page, module, stylesheet and illustrations load below the project prefix")

            open_nav(page, "notes")
            expect(page.locator(".empty-notes")).to_be_visible()
            run_story(page)
            expect(page.locator("#status-message")).to_contain_text("저장했어")
            open_nav(page, "notes")
            page.reload(wait_until="networkidle")
            expect(page.locator(".saved-note")).to_have_count(1)
            expect(page.locator(".saved-reflection")).to_contain_text(REFLECTION)
            snapshot = page.evaluate("JSON.parse(localStorage.getItem('question-club-notes-v1'))[0]")
            assert snapshot["initial"] == [5, 3, 2]
            assert snapshot["final"] == [3, 3, 4]
            screenshot(page, output, "project-saved-note.png")
            report["passed"].append("all six episode steps, note save and reload restoration below the project prefix")

            open_nav(page, "library")
            expect(page.locator(".library-card")).to_have_count(3)
            links = page.locator(".reading-room a")
            expect(links).to_have_count(3)
            documents = []
            for index, required in enumerate(["본편 대본", "출처", "로드맵"]):
                link = links.nth(index)
                url = link.evaluate("element => element.href")
                assert url.startswith(base_url + "docs/"), url
                assert url.endswith(".html"), "Public reading links should use the generated HTML documents."
                with page.expect_popup() as popup_info:
                    link.click()
                popup = popup_info.value
                popup.wait_for_load_state("networkidle")
                expect(popup.locator("body")).to_contain_text(required)
                expect(popup.locator("h1")).to_have_count(1)
                assert "\ufffd" not in popup.locator("body").inner_text(), "Broken UTF-8 in document."
                charset = popup.locator("meta[charset]").get_attribute("charset")
                assert charset.lower().replace("-", "") == "utf8", charset
                document_response = desktop.request.get(url)
                assert document_response.status == 200
                assert "text/html" in document_response.headers.get("content-type", "")
                documents.append(url)
                popup.close()
            screenshot(page, output, "project-library.png")
            report["documents"] = documents
            report["passed"].append("library links open three readable UTF-8 HTML documents below the project prefix")

            mobile_context = context(viewport={"width": 390, "height": 844},
                                     is_mobile=True, has_touch=True, device_scale_factor=1)
            mobile = mobile_context.new_page()
            mobile.goto(base_url + "#episode", wait_until="networkidle")
            expect(mobile.locator(".story-label")).to_have_text("이야기 미리보기")
            assert_no_overflow(mobile, "project-episode-story", report["mobile_widths"])
            screenshot(mobile, output, "project-mobile-story.png")
            report["passed"].append("390px mobile episode layout has no horizontal overflow")

            for key in ["console_errors", "failed_requests", "resource_errors", "outside_project_requests"]:
                assert not report[key], (key, report[key])
            report["passed"].append("zero browser errors, missing resources or requests outside the project prefix")
            browser.close()
            browser = None
        (output / "pages-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        if browser:
            browser.close()
        stop_project_server(server)


if __name__ == "__main__":
    main()
