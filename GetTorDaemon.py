#!/usr/bin/env python3
import platform
import sys
import os
import shutil
import urllib.request
import tarfile
import re
import stat
from html.parser import HTMLParser

# ──────────────────────────────────────────────
# ANSI COLORS  (work on Windows 10+ and Linux)
# ──────────────────────────────────────────────

def _enable_ansi_windows():
    """Enable ANSI escape codes on Windows 10+."""
    if platform.system() == "Windows":
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)

_enable_ansi_windows()

R  = "\033[31m"   # red
G  = "\033[32m"   # green
Y  = "\033[33m"   # yellow
B  = "\033[34m"   # blue
M  = "\033[35m"   # magenta
C  = "\033[36m"   # cyan
W  = "\033[37m"   # white
DIM= "\033[2m"    # dim
BLD= "\033[1m"    # bold
RST= "\033[0m"    # reset

def banner():
    print(f"""
{C}{BLD} 
  ████████╗ ██████╗ ██████╗
  ╚══██╔══╝██╔═══██╗██╔══██╗
     ██║   ██║   ██║██████╔╝
     ██║   ██║   ██║██╔══██╗
     ██║   ╚██████╔╝██║  ██║
     ╚═╝    ╚═════╝ ╚═╝  ╚═╝ 
  {DIM}daemon installer{RST}
  {DIM}P2N Peer Networking v1.0{RST}
""")

def step(icon, msg):
    print(f"  {icon}  {msg}")

def ok(msg):
    print(f"  {G}✔{RST}  {msg}")

def info(msg):
    print(f"  {C}•{RST}  {DIM}{msg}{RST}")

def warn(msg):
    print(f"  {Y}⚠{RST}  {Y}{msg}{RST}")

def err(msg):
    print(f"  {R}✘{RST}  {R}{msg}{RST}")

def section(title):
    width = 44
    pad   = (width - len(title) - 2) // 2
    print(f"\n{DIM}  {'─' * pad} {title} {'─' * pad}{RST}")

def divider():
    print(f"{DIM}  {'─' * 44}{RST}")

# ──────────────────────────────────────────────
# PATH CONFIG
# ──────────────────────────────────────────────

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
TOR_DIR     = os.path.join(SCRIPT_DIR, "tor")
TOR_EXE_WIN = os.path.join(TOR_DIR, "tor.exe")
TOR_EXE_LIN = os.path.join(TOR_DIR, "tor")

TOR_DOWNLOAD_PAGE = "https://www.torproject.org/download/tor/"

# ──────────────────────────────────────────────
# SCRAPER
# ──────────────────────────────────────────────

class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for name, val in attrs:
                if name == "href" and val:
                    self.links.append(val)

def get_tor_expert_bundle_url(platform_pattern):
    info("Contacting torproject.org...")
    try:
        req = urllib.request.Request(
            TOR_DOWNLOAD_PAGE,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        parser = _LinkParser()
        parser.feed(html)
        pattern = re.compile(platform_pattern, re.IGNORECASE)

        for link in parser.links:
            if link.startswith("/"):
                link = "https://www.torproject.org" + link
            if pattern.match(link):
                return link

        match = pattern.search(html)
        if match:
            return match.group()

        err("Could not find download URL on the page.")
        return None

    except Exception as e:
        err(f"Network error: {e}")
        return None

# ──────────────────────────────────────────────
# DOWNLOAD + EXTRACT
# ──────────────────────────────────────────────

def _dl_progress(block, block_size, total):
    done  = block * block_size
    pct   = min(int(done * 100 / total), 100) if total > 0 else 0
    filled = pct // 5
    bar   = f"{G}{'█' * filled}{DIM}{'░' * (20 - filled)}{RST}"
    mb_done  = done / 1_048_576
    mb_total = total / 1_048_576
    print(f"\r  {bar}  {BLD}{pct:>3}%{RST}  {DIM}{mb_done:.1f} / {mb_total:.1f} MB{RST}  ",
          end="", flush=True)

def download_and_extract(url, exe_search_suffix, final_exe_path):
    os.makedirs(TOR_DIR, exist_ok=True)
    archive_path = os.path.join(TOR_DIR, "tor-expert-bundle.tar.gz")

    # Show short version of URL
    url_short = re.sub(r'https://[^/]+/', '', url)
    info(f"Source  : {DIM}{url_short}{RST}")
    info(f"Target  : {DIM}{TOR_DIR}{RST}")
    print()

    try:
        urllib.request.urlretrieve(url, archive_path, reporthook=_dl_progress)
        print()   # newline after progress bar
    except Exception as e:
        print()
        err(f"Download failed: {e}")
        return False

    ok("Download complete")
    step(f"{C}⠿{RST}", "Extracting tor binary from archive...")

    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            tor_member = next(
                (m for m in tar.getmembers()
                 if m.name.lower().endswith(exe_search_suffix)),
                None
            )
            if tor_member is None:
                err("tor binary not found in archive.")
                return False

            tor_member.name = os.path.basename(final_exe_path)
            tar.extract(tor_member, TOR_DIR)
    except Exception as e:
        err(f"Extraction failed: {e}")
        return False
    finally:
        if os.path.isfile(archive_path):
            os.remove(archive_path)

    if platform.system() != "Windows":
        os.chmod(final_exe_path, os.stat(final_exe_path).st_mode | stat.S_IEXEC)

    return os.path.isfile(final_exe_path)

# ──────────────────────────────────────────────
# TOR HELPERS
# ──────────────────────────────────────────────

def tor_exe():
    return TOR_EXE_WIN if platform.system() == "Windows" else TOR_EXE_LIN

def is_tor_installed():
    return os.path.isfile(tor_exe())

def download_tor():
    if platform.system() == "Windows":
        url = get_tor_expert_bundle_url(
            r'https://[^\s"\']+tor-expert-bundle-windows-x86_64-[^\s"\']+\.tar\.gz'
        )
        suffix, final = "tor/tor.exe", TOR_EXE_WIN
    else:
        url = get_tor_expert_bundle_url(
            r'https://[^\s"\']+tor-expert-bundle-linux-x86_64-[^\s"\']+\.tar\.gz'
        )
        suffix, final = "tor/tor", TOR_EXE_LIN

    if not url:
        return False
    return download_and_extract(url, suffix, final)

def uninstall_tor():
    if os.path.isdir(TOR_DIR):
        shutil.rmtree(TOR_DIR)
        ok(f"Removed: {DIM}{TOR_DIR}{RST}")
    else:
        warn("Tor folder not found — nothing to remove.")

def upgrade_tor():
    step(f"{Y}↑{RST}", "Fetching latest version...")
    if os.path.isfile(tor_exe()):
        os.remove(tor_exe())
    return download_tor()

# ──────────────────────────────────────────────
# SECOND-RUN MENU
# ──────────────────────────────────────────────

def second_run_menu():
    exe = tor_exe()
    size_kb = os.path.getsize(exe) // 1024 if os.path.isfile(exe) else 0

    section("Already Installed")
    ok(f"tor binary found  {DIM}({size_kb} KB){RST}")
    info(f"Path: {DIM}{exe}{RST}")
    print()
    print(f"  {BLD}What would you like to do?{RST}\n")
    print(f"    {C}1{RST}  {W}Upgrade Tor{RST}   {DIM}(re-download latest){RST}")
    print(f"    {R}2{RST}  {W}Uninstall Tor{RST} {DIM}(removes tor folder){RST}")
    print(f"    {DIM}0  Exit{RST}")
    print()

    choice = input(f"  {BLD}>{RST} ").strip()

    if choice == "1":
        section("Upgrade")
        if upgrade_tor():
            ok(f"Tor upgraded successfully")
            info(f"Path: {DIM}{tor_exe()}{RST}")
        else:
            err("Upgrade failed.")

    elif choice == "2":
        print()
        confirm = input(f"  {R}Remove tor folder? (y/n){RST} ").strip().lower()
        if confirm == "y":
            section("Uninstall")
            uninstall_tor()
            ok("Tor uninstalled.")
        else:
            info("Cancelled.")

    elif choice == "0":
        info("Bye!")
        sys.exit(0)
    else:
        warn("Invalid choice.")

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────

def execute_os_commands():
    banner()

    current_os = platform.system()
    os_label   = {"Windows": "Windows", "Linux": "Linux"}.get(current_os)

    if not os_label:
        err(f"Unsupported OS: {current_os}")
        sys.exit(1)

    info(f"OS detected: {BLD}{os_label}{RST}")
    divider()

    if is_tor_installed():
        second_run_menu()
    else:
        section("Install")
        step(f"{C}↓{RST}", "Fetching latest Tor Expert Bundle...")
        print()
        if not download_tor():
            err("Installation failed.")
            sys.exit(1)
        print()
        divider()
        ok(f"{BLD}{G}Tor is ready!{RST}")
        info(f"Binary : {DIM}{tor_exe()}{RST}")

    print()

if __name__ == "__main__":
    execute_os_commands()
