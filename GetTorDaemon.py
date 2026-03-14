#!/usr/bin/env python3
"""
GetTorDaemon.py — P2N Pre-requisite: Install Tor Daemon
========================================================
Run this BEFORE using P2N to install the Tor daemon.
  - Linux : installs via system package manager (apt/pacman/dnf)
  - Windows: downloads Tor Expert Bundle and extracts tor.exe + required DLLs
             into ./tor/ folder (no full Tor Browser install)

Usage:
  python GetTorDaemon.py
"""

import os
import sys
import platform
import subprocess
import shutil
import tempfile
import urllib.request
import tarfile

# ── CONFIG ──────────────────────────────────────────────────────────────────
# NOTE: If this version is outdated, check https://www.torproject.org/download/tor/
# for the latest Tor Expert Bundle version and update TOR_VERSION below.
TOR_VERSION = "14.0.9"
TOR_WIN_URL   = (
    f"https://archive.torproject.org/tor-package-archive/torbrowser/"
    f"{TOR_VERSION}/tor-expert-bundle-windows-x86_64-{TOR_VERSION}.tar.gz"
)
TOR_LINUX_URL = (
    f"https://archive.torproject.org/tor-package-archive/torbrowser/"
    f"{TOR_VERSION}/tor-expert-bundle-linux-x86_64-{TOR_VERSION}.tar.gz"
)
INSTALL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tor")

# DLLs that tor.exe depends on inside the Expert Bundle (Windows)
# Without these, tor.exe will fail to start with a missing DLL error.
WINDOWS_REQUIRED_FILES = {"tor.exe", "libssl-3-x64.dll", "libcrypto-3-x64.dll", "zlib1.dll"}

# GeoIP files — optional but prevent startup warnings
GEOIP_FILES = {"geoip", "geoip6"}

# ── COLORS ──────────────────────────────────────────────────────────────────
def _supports_color():
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

C      = _supports_color()
GREEN  = "\033[92m" if C else ""
RED    = "\033[91m" if C else ""
YELLOW = "\033[93m" if C else ""
CYAN   = "\033[96m" if C else ""
BOLD   = "\033[1m"  if C else ""
RESET  = "\033[0m"  if C else ""

def ok(msg):   print(f"{GREEN}[✓]{RESET} {msg}")
def err(msg):  print(f"{RED}[✗]{RESET} {msg}")
def info(msg): print(f"{CYAN}[i]{RESET} {msg}")
def warn(msg): print(f"{YELLOW}[!]{RESET} {msg}")


# ── DOWNLOAD HELPER ─────────────────────────────────────────────────────────
def _download_with_progress(url: str, dest: str, timeout: int = 60) -> None:
    """
    Download *url* to *dest* file path, printing a simple progress indicator.
    Raises urllib.error.URLError / OSError on failure.
    Timeout applies to the initial connection + each read chunk.
    """
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        total = resp.headers.get("content-length")
        total = int(total) if total else None
        downloaded = 0
        chunk_size = 65536  # 64 KB

        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    mb  = downloaded / 1_048_576
                    print(f"\r  {mb:6.1f} MB  [{pct:3d}%]", end="", flush=True)
                else:
                    mb = downloaded / 1_048_576
                    print(f"\r  {mb:6.1f} MB", end="", flush=True)
    print()  # newline after progress


def _safe_extract_file(tar: tarfile.TarFile, member: tarfile.TarInfo, dest_dir: str) -> None:
    """
    Extract a single *member* from an open TarFile into *dest_dir*,
    writing only the file's basename (strips any path components).

    Uses extractfile() + manual write to avoid the mutating-member-name
    hack and to stay compatible with Python 3.14's stricter tar filters.
    """
    basename = os.path.basename(member.name)
    dest_path = os.path.join(dest_dir, basename)
    fobj = tar.extractfile(member)
    if fobj is None:
        raise OSError(f"Could not open member '{member.name}' inside archive")
    with fobj, open(dest_path, "wb") as out:
        shutil.copyfileobj(fobj, out)


# ── LINUX ───────────────────────────────────────────────────────────────────
def install_linux_package_manager() -> bool:
    """Try to install Tor via the system package manager."""
    managers = [
        (["apt-get", "--version"], ["sudo", "apt-get", "install", "-y", "tor"]),
        (["pacman",  "--version"], ["sudo", "pacman",  "-S", "--noconfirm", "tor"]),
        (["dnf",     "--version"], ["sudo", "dnf",     "install", "-y", "tor"]),
        (["yum",     "--version"], ["sudo", "yum",     "install", "-y", "tor"]),
        (["zypper",  "--version"], ["sudo", "zypper",  "install", "-y", "tor"]),
    ]
    for check_cmd, install_cmd in managers:
        try:
            subprocess.run(check_cmd, capture_output=True, check=True)
            info(f"Found package manager: {check_cmd[0]}")
            info(f"Running: {' '.join(install_cmd)}")
            result = subprocess.run(install_cmd)
            if result.returncode == 0:
                ok("Tor installed successfully via package manager!")
                return True
            err(f"Package manager install failed (exit code {result.returncode})")
            return False
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    return False


def install_linux_bundle() -> bool:
    """
    Download Tor Expert Bundle for Linux as a fallback.

    Extracts the 'tor' binary AND any bundled shared libraries (.so files)
    found alongside it, because the bundled tor binary links against
    specific versions of libssl/libcrypto that may differ from the system ones.
    """
    info(f"Downloading Tor Expert Bundle from:\n  {TOR_LINUX_URL}")
    try:
        tmp = tempfile.mkdtemp(prefix="p2n-tor-")
        archive_path = os.path.join(tmp, "tor-bundle.tar.gz")

        _download_with_progress(TOR_LINUX_URL, archive_path)
        ok("Download complete")

        info("Extracting tor binary and libraries...")
        os.makedirs(INSTALL_DIR, exist_ok=True)

        extracted_tor = False
        with tarfile.open(archive_path, "r:gz") as tar:
            for member in tar.getmembers():
                if member.isdir():
                    continue
                basename = os.path.basename(member.name)
                # Extract the tor binary
                if basename == "tor":
                    _safe_extract_file(tar, member, INSTALL_DIR)
                    os.chmod(os.path.join(INSTALL_DIR, "tor"), 0o755)
                    ok(f"Extracted: {INSTALL_DIR}/tor")
                    extracted_tor = True
                # Also extract bundled shared libraries
                elif basename.endswith(".so") or ".so." in basename:
                    _safe_extract_file(tar, member, INSTALL_DIR)
                    info(f"Extracted library: {basename}")

        if not extracted_tor:
            err("Could not find 'tor' binary in the bundle")
            return False

        shutil.rmtree(tmp, ignore_errors=True)
        ok("Tor daemon ready!")
        info(f"Location: {INSTALL_DIR}/tor")
        return True

    except Exception as e:
        err(f"Download/extract failed: {e}")
        return False


def install_linux() -> bool:
    info("Platform: Linux")

    # Already installed system-wide?
    if shutil.which("tor"):
        ok("Tor is already installed and in PATH!")
        result = subprocess.run(["tor", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            info(result.stdout.strip().split("\n")[0])
        return True

    # Already extracted locally?
    local_tor = os.path.join(INSTALL_DIR, "tor")
    if os.path.exists(local_tor):
        ok(f"tor already present at: {local_tor}")
        return True

    info("Tor not found. Attempting package manager install...")
    if install_linux_package_manager():
        return True

    warn("Package manager failed. Falling back to Expert Bundle download...")
    return install_linux_bundle()


# ── WINDOWS ─────────────────────────────────────────────────────────────────
def _verify_tor_binary(tor_path: str) -> bool:
    """Run tor --version to check the binary actually works."""
    try:
        result = subprocess.run(
            [tor_path, "--version"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            version_line = result.stdout.strip().split("\n")[0]
            ok(f"Tor binary works: {version_line}")
            return True
    except Exception:
        pass
    return False


def install_windows() -> bool:
    """
    Download Tor Expert Bundle for Windows and extract tor.exe, DLLs, and GeoIP files.
    FIX: tries multiple version URLs so it never silently fails on a 404.
    """
    info("Platform: Windows")

    local_tor = os.path.join(INSTALL_DIR, "tor.exe")

    # Already present? Verify it actually runs.
    if os.path.exists(local_tor):
        if _verify_tor_binary(local_tor):
            ok(f"tor.exe is ready at: {INSTALL_DIR}")
            return True
        warn("tor.exe exists but failed to run. Re-extracting...")

    # In PATH already?
    tor_in_path = shutil.which("tor")
    if tor_in_path:
        if _verify_tor_binary(tor_in_path):
            ok("Tor is already installed and in PATH!")
            return True

    # FIX: Try configured version first, then fall back to known-good versions
    # in case the primary URL returns 404 after a new release.
    def _make_win_url(v):
        return (f"https://archive.torproject.org/tor-package-archive/torbrowser/"
                f"{v}/tor-expert-bundle-windows-x86_64-{v}.tar.gz")

    candidate_urls = [TOR_WIN_URL]
    for v in ["14.0.8", "14.0.7", "13.5.9", "13.5.8"]:
        u = _make_win_url(v)
        if u != TOR_WIN_URL:
            candidate_urls.append(u)

    tmp = tempfile.mkdtemp(prefix="p2n-tor-")
    archive_path = None
    used_url = None
    for url in candidate_urls:
        info(f"Trying: {url}")
        dest = os.path.join(tmp, "tor-bundle.tar.gz")
        try:
            _download_with_progress(url, dest)
            archive_path = dest
            used_url = url
            ok("Download complete")
            break
        except Exception as e:
            warn(f"  Failed ({e}), trying next version...")

    if not archive_path:
        err("All download attempts failed.")
        warn("Manually download the Tor Expert Bundle from:")
        warn("  https://www.torproject.org/download/tor/")
        warn(f"  Extract tor.exe and DLLs to: {INSTALL_DIR}")
        shutil.rmtree(tmp, ignore_errors=True)
        return False

    info(f"Extracting tor.exe, DLLs, and GeoIP files from: {used_url}")
    os.makedirs(INSTALL_DIR, exist_ok=True)

    extracted = set()
    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            for member in tar.getmembers():
                if member.isdir():
                    continue
                basename = os.path.basename(member.name)
                # Extract tor.exe, known DLLs, any other DLLs, and GeoIP data files
                if (basename in WINDOWS_REQUIRED_FILES
                        or basename.endswith(".dll")
                        or basename in GEOIP_FILES):
                    _safe_extract_file(tar, member, INSTALL_DIR)
                    ok(f"Extracted: {basename}")
                    extracted.add(basename)
    except Exception as e:
        err(f"Extraction failed: {e}")
        shutil.rmtree(tmp, ignore_errors=True)
        return False

    shutil.rmtree(tmp, ignore_errors=True)

    if "tor.exe" not in extracted:
        err("Could not find 'tor.exe' in the bundle")
        return False

    # Verify the extracted binary actually works
    if _verify_tor_binary(local_tor):
        ok("Tor daemon ready!")
    else:
        missing_dlls = WINDOWS_REQUIRED_FILES - extracted
        if missing_dlls:
            warn(f"DLLs not found in bundle: {missing_dlls}")
            warn("tor.exe may still work if these are statically linked (v13+).")
        else:
            warn("tor.exe extracted but --version check failed. It may still work at runtime.")

    if "geoip" not in extracted:
        warn("GeoIP files not found — Tor will log path warnings but will still connect.")

    info(f"Location: {INSTALL_DIR}")
    return True


# ── MACOS ───────────────────────────────────────────────────────────────────
def install_macos() -> bool:
    info("Platform: macOS")

    # Already installed?
    if shutil.which("tor"):
        ok("Tor is already installed and in PATH!")
        result = subprocess.run(["tor", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            info(result.stdout.strip().split("\n")[0])
        return True

    # Try Homebrew automatically
    if shutil.which("brew"):
        info("Homebrew found. Running: brew install tor")
        result = subprocess.run(["brew", "install", "tor"])
        if result.returncode == 0:
            ok("Tor installed via Homebrew!")
            return True
        err("brew install tor failed.")
    else:
        warn("Homebrew not found. Install it from https://brew.sh then run:")
        print(f"\n  {BOLD}brew install tor{RESET}\n")

    warn("Then re-run this script, or add 'tor' to your PATH manually.")
    return False


# ── MAIN ────────────────────────────────────────────────────────────────────
def main() -> int:
    print()
    print(f"{BOLD}{CYAN}╔══════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{CYAN}║   P2N — Tor Daemon Installer             ║{RESET}")
    print(f"{BOLD}{CYAN}║   Pre-requisite for cross-network P2P    ║{RESET}")
    print(f"{BOLD}{CYAN}╚══════════════════════════════════════════╝{RESET}")
    print()

    system = platform.system().lower()

    if system == "linux":
        success = install_linux()
    elif system == "windows":
        success = install_windows()
    elif system == "darwin":
        success = install_macos()
    else:
        err(f"Unsupported platform: {system}")
        success = False

    print()
    if success:
        ok(f"{BOLD}Tor daemon is ready! You can now use P2N.{RESET}")
    else:
        err(
            f"{BOLD}Tor installation incomplete. "
            f"P2N will work for local connections but Tor features won't be available.{RESET}"
        )
    print()

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
