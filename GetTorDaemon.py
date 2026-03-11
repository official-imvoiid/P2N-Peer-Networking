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
TOR_VERSION = "13.0.9"
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
def install_windows() -> bool:
    """
    Download Tor Expert Bundle for Windows and extract tor.exe plus the
    DLLs it depends on (libssl, libcrypto, zlib1).

    IMPORTANT: Extracting *only* tor.exe is not enough — it will immediately
    crash at startup with a missing DLL error if the libraries are absent.
    """
    info("Platform: Windows")

    local_tor = os.path.join(INSTALL_DIR, "tor.exe")

    # Already present and complete?
    if os.path.exists(local_tor):
        missing = [
            f for f in WINDOWS_REQUIRED_FILES
            if not os.path.exists(os.path.join(INSTALL_DIR, f))
        ]
        if not missing:
            ok(f"tor.exe and all required DLLs already present in: {INSTALL_DIR}")
            return True
        warn(f"tor.exe found but missing DLLs: {missing}. Re-extracting...")

    # In PATH already?
    if shutil.which("tor"):
        ok("Tor is already installed and in PATH!")
        return True

    info(f"Downloading Tor Expert Bundle from:\n  {TOR_WIN_URL}")
    try:
        tmp = tempfile.mkdtemp(prefix="p2n-tor-")
        archive_path = os.path.join(tmp, "tor-bundle.tar.gz")

        _download_with_progress(TOR_WIN_URL, archive_path)
        ok("Download complete")

        info("Extracting tor.exe and required DLLs...")
        os.makedirs(INSTALL_DIR, exist_ok=True)

        extracted = set()
        with tarfile.open(archive_path, "r:gz") as tar:
            for member in tar.getmembers():
                if member.isdir():
                    continue
                basename = os.path.basename(member.name)
                if basename in WINDOWS_REQUIRED_FILES:
                    _safe_extract_file(tar, member, INSTALL_DIR)
                    ok(f"Extracted: {basename}")
                    extracted.add(basename)

        missing = WINDOWS_REQUIRED_FILES - extracted
        if "tor.exe" not in extracted:
            err("Could not find 'tor.exe' in the bundle")
            return False
        if missing:
            warn(f"Some expected files were not found in bundle: {missing}")
            warn("tor.exe may still work if your system has these DLLs installed.")

        shutil.rmtree(tmp, ignore_errors=True)
        ok("Tor daemon ready!")
        info(f"Location: {INSTALL_DIR}")
        return True

    except Exception as e:
        err(f"Download/extract failed: {e}")
        warn("You can manually download the Tor Expert Bundle from:")
        warn("  https://www.torproject.org/download/tor/")
        warn(f"  Extract tor.exe and DLLs to: {INSTALL_DIR}")
        return False


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
