import ipaddress
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

MAX_URL_BYTES = 10 * 1024 * 1024
FETCH_TIMEOUT = 30.0
MAX_LINKS_PER_PAGE = 80


class _LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        href = None
        for k, v in attrs:
            if k.lower() == "href":
                href = v
                break
        if href:
            self.links.append(href)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip = False
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = data.strip()
            if text:
                self._parts.append(text)

    def get_text(self) -> str:
        text = " ".join(self._parts)
        text = re.sub(r"\n\s*\n+", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()


def _is_blocked_host(hostname: str) -> bool:
    host = hostname.lower().strip(".")
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except ValueError:
        return False


def validate_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are supported")
    if not parsed.netloc:
        raise ValueError("Invalid URL")
    hostname = parsed.hostname or ""
    if _is_blocked_host(hostname):
        raise ValueError("URLs pointing to local or private networks are not allowed")
    return url.strip()


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        return url.strip()
    # drop fragments; normalize scheme/host case
    parsed = parsed._replace(fragment="", scheme=parsed.scheme.lower(), netloc=parsed.netloc.lower())
    # strip common tracking query params (minimal)
    if parsed.query:
        keep = []
        for part in parsed.query.split("&"):
            k = part.split("=", 1)[0].lower()
            if k.startswith("utm_") or k in {"gclid", "fbclid"}:
                continue
            keep.append(part)
        parsed = parsed._replace(query="&".join(keep))
    return urlunparse(parsed)


def same_domain(seed_url: str, candidate_url: str) -> bool:
    a = urlparse(seed_url)
    b = urlparse(candidate_url)
    return (a.hostname or "").lower() == (b.hostname or "").lower()


def extract_links(html: str, base_url: str) -> list[str]:
    parser = _LinkExtractor()
    parser.feed(html)
    out: list[str] = []
    for raw in parser.links[:MAX_LINKS_PER_PAGE]:
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.lower().startswith(("mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base_url, raw)
        out.append(normalize_url(absolute))
    # de-dupe preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for u in out:
        if u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    return uniq


def display_name_for_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc or parsed.path
    path = parsed.path if parsed.path not in {"", "/"} else ""
    name = f"{host}{path}"
    if len(name) > 80:
        return name[:77] + "..."
    return name


async def fetch_url_text(url: str) -> str:
    validate_url(url)
    async with httpx.AsyncClient(
        timeout=FETCH_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": "RAGPlatform/1.0"},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").lower()
        if "text/html" in content_type or "application/xhtml" in content_type:
            html = response.text
        elif content_type.startswith("text/") or "application/json" in content_type:
            html = response.text
        else:
            raise ValueError(f"Unsupported content type: {content_type or 'unknown'}")

        if len(html.encode("utf-8")) > MAX_URL_BYTES:
            raise ValueError("Page exceeds 10 MB limit")

        if "text/html" in content_type or "application/xhtml" in content_type:
            parser = _TextExtractor()
            parser.feed(html)
            text = parser.get_text()
        else:
            text = html.strip()

        if not text:
            raise ValueError("No text content found at URL")
        return text


async def fetch_url_html(url: str) -> str:
    validate_url(url)
    async with httpx.AsyncClient(
        timeout=FETCH_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": "RAGPlatform/1.0"},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            raise ValueError("URL is not an HTML page")
        html = response.text
        if len(html.encode("utf-8")) > MAX_URL_BYTES:
            raise ValueError("Page exceeds 10 MB limit")
        return html
