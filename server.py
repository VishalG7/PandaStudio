from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime
import json
import os
import sys
import threading
import webbrowser

# Ensure UTF-8 output encoding on Windows consoles to prevent cp1252 / charmap crashes
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6700
DEFAULT_MAX_BACKUPS = 5

# When packaged by PyInstaller into a standalone executable, assets are in sys._MEIPASS
# while user data (backups, logs, config) lives in the directory containing the executable.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    BUNDLE_DIR = Path(sys._MEIPASS).resolve()
    EXE_DIR = Path(sys.executable).resolve().parent
    # If running from within a dist/ folder inside the workspace, share the workspace data dirs
    if EXE_DIR.name.lower() == "dist" and (EXE_DIR.parent / "index.html").exists():
        EXE_DIR = EXE_DIR.parent
else:
    BUNDLE_DIR = Path(__file__).resolve().parent
    EXE_DIR = BUNDLE_DIR

BASE_DIR = EXE_DIR
BACKUP_DIR = EXE_DIR / "backups"
LOGS_DIR = BACKUP_DIR / "logs"
AUDIO_DIR = EXE_DIR / "audio"
SUBTITLES_DIR = EXE_DIR / "subtitles"
CONFIG_FILE = EXE_DIR / "config.json"

# Ensure runtime directories exist
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)

# Active host and port (configurable via CLI, ENV, or config.json)
CURRENT_HOST = DEFAULT_HOST
CURRENT_PORT = DEFAULT_PORT
MAX_BACKUP_FILES = DEFAULT_MAX_BACKUPS


_WHISPER_MODELS = {}
_SRT_JOBS = {}


def update_srt_job(job_id, **kwargs):
    if not job_id:
        return
    job = _SRT_JOBS.setdefault(job_id, {"status": "running", "percent": 0, "stage": "Starting...", "detail": ""})
    job.update(kwargs)


def format_srt_timestamp(seconds):
    """Format float seconds into standard SRT timestamp HH:MM:SS,mmm."""
    total_ms = max(0, int(round(seconds * 1000)))
    ms = total_ms % 1000
    total_sec = total_ms // 1000
    s = total_sec % 60
    total_min = total_sec // 60
    m = total_min % 60
    h = total_min // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def find_ffmpeg_bin():
    """Locate ffmpeg binary on PATH or common Windows install locations."""
    import shutil
    found = shutil.which("ffmpeg")
    if found:
        return found
    for candidate in [
        r"D:\Developer\FFmpeg\ffmpeg-8.1.2-full_build\bin\ffmpeg.EXE",
        r"C:\ffmpeg\bin\ffmpeg.exe"
    ]:
        if os.path.exists(candidate):
            return candidate
    return None


def cleanup_old_backups(max_files=None):
    """Keep only the newest `max_files` library-backup-*.json files in BACKUP_DIR."""
    limit = max_files if max_files is not None else MAX_BACKUP_FILES
    if not BACKUP_DIR.exists() or limit < 1:
        return []
    backup_files = sorted(
        list(BACKUP_DIR.glob("library-backup-*.json")),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    removed = []
    for old_file in backup_files[limit:]:
        try:
            old_file.unlink()
            removed.append(old_file.name)
            print(f"[Backup Cleanup] Deleted old backup (limit {limit}): {old_file.name}")
        except Exception as e:
            print(f"[Backup Cleanup Warning] Could not delete {old_file.name}: {e}")
    return removed

def normalize_rate(val):
    if not val:
        return "+0%"
    val = str(val).strip()
    if val.endswith("%"):
        if not val.startswith(("+", "-")):
            val = f"+{val}"
        return val
    try:
        f = float(val.replace("x", ""))
        pct = int(round((f - 1.0) * 100))
        return f"+{pct}%" if pct >= 0 else f"{pct}%"
    except Exception:
        return "+0%"

def normalize_pitch(val):
    if not val:
        return "+0Hz"
    val = str(val).strip()
    if val.endswith("Hz"):
        if not val.startswith(("+", "-")):
            val = f"+{val}"
        return val
    return "+0Hz"

VOICE_CATALOG = [
    # Featured Voices
    {"id": "en-US-JennyNeural", "name": "Jenny (US English, Warm & Conversational)", "gender": "Female", "locale": "en-US", "category": "Featured"},
    {"id": "en-US-GuyNeural", "name": "Guy (US English, Casual & Natural)", "gender": "Male", "locale": "en-US", "category": "Featured"},
    {"id": "en-US-AriaNeural", "name": "Aria (US English, Expressive & Broadcast)", "gender": "Female", "locale": "en-US", "category": "Featured"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (British English, Clear & Elegant)", "gender": "Female", "locale": "en-GB", "category": "Featured"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (British English, Natural & Crisp)", "gender": "Male", "locale": "en-GB", "category": "Featured"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (Indian English, Natural & Professional)", "gender": "Female", "locale": "en-IN", "category": "Featured"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat (Indian English, Confident & Warm)", "gender": "Male", "locale": "en-IN", "category": "Featured"},

    # US English
    {"id": "en-US-ChristopherNeural", "name": "Christopher (US English, Authoritative Narration)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-EricNeural", "name": "Eric (US English, Documentary Style)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-MichelleNeural", "name": "Michelle (US English, Storyteller & Friendly)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-RogerNeural", "name": "Roger (US English, Deep Storyteller)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-BrianNeural", "name": "Brian (US English, Professional Voiceover)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-EmmaNeural", "name": "Emma (US English, Bright & Cheerful)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-DavisNeural", "name": "Davis (US English, Calm & Relaxed)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AmberNeural", "name": "Amber (US English, Dynamic & Energetic)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AnaNeural", "name": "Ana (US English, Young & Animated)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AndrewNeural", "name": "Andrew (US English, Confident & Smooth)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-SteffanNeural", "name": "Steffan (US English, Casual & Youthful)", "gender": "Male", "locale": "en-US", "category": "US English"},

    # UK English
    {"id": "en-GB-LibbyNeural", "name": "Libby (British English, Gentle & Storyteller)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-ThomasNeural", "name": "Thomas (British English, Formal & Prestigious)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-BellaNeural", "name": "Bella (British English, Warm & Bright)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-AlfieNeural", "name": "Alfie (British English, Youthful)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-ElliotNeural", "name": "Elliot (British English, Narrative)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-MaisieNeural", "name": "Maisie (British English, Child/Young)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-OliverNeural", "name": "Oliver (British English, Conversational)", "gender": "Male", "locale": "en-GB", "category": "UK English"},

    # Indian English & Hindi
    {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi, Clear & Melodic)", "gender": "Female", "locale": "hi-IN", "category": "Hindi & Indian"},
    {"id": "hi-IN-MadhurNeural", "name": "Madhur (Hindi, Deep & Expressive)", "gender": "Male", "locale": "hi-IN", "category": "Hindi & Indian"},

    # Australia & Canada
    {"id": "en-AU-NatashaNeural", "name": "Natasha (Australian English, Warm)", "gender": "Female", "locale": "en-AU", "category": "Australia & Canada"},
    {"id": "en-AU-WilliamNeural", "name": "William (Australian English, Clear)", "gender": "Male", "locale": "en-AU", "category": "Australia & Canada"},
    {"id": "en-CA-ClaraNeural", "name": "Clara (Canadian English, Clear)", "gender": "Female", "locale": "en-CA", "category": "Australia & Canada"},
    {"id": "en-CA-LiamNeural", "name": "Liam (Canadian English, Natural)", "gender": "Male", "locale": "en-CA", "category": "Australia & Canada"},

    # European & Global
    {"id": "es-ES-ElviraNeural", "name": "Elvira (Spanish - Spain, Natural)", "gender": "Female", "locale": "es-ES", "category": "European & Global"},
    {"id": "es-ES-AlvaroNeural", "name": "Alvaro (Spanish - Spain, Rich)", "gender": "Male", "locale": "es-ES", "category": "European & Global"},
    {"id": "es-MX-DaliaNeural", "name": "Dalia (Spanish - Mexico, Warm)", "gender": "Female", "locale": "es-MX", "category": "European & Global"},
    {"id": "fr-FR-DeniseNeural", "name": "Denise (French - France, Eloquent)", "gender": "Female", "locale": "fr-FR", "category": "European & Global"},
    {"id": "fr-FR-HenriNeural", "name": "Henri (French - France, Deep)", "gender": "Male", "locale": "fr-FR", "category": "European & Global"},
    {"id": "de-DE-KatjaNeural", "name": "Katja (German - Germany, Crisp)", "gender": "Female", "locale": "de-DE", "category": "European & Global"},
    {"id": "de-DE-ConradNeural", "name": "Conrad (German - Germany, Authoritative)", "gender": "Male", "locale": "de-DE", "category": "European & Global"},
    {"id": "it-IT-ElsaNeural", "name": "Elsa (Italian - Italy, Melodic)", "gender": "Female", "locale": "it-IT", "category": "European & Global"},
    {"id": "it-IT-DiegoNeural", "name": "Diego (Italian - Italy, Expressive)", "gender": "Male", "locale": "it-IT", "category": "European & Global"},
    {"id": "pt-BR-FranciscaNeural", "name": "Francisca (Portuguese - Brazil, Warm)", "gender": "Female", "locale": "pt-BR", "category": "European & Global"},

    # Asian Languages
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Japanese, Gentle & Clear)", "gender": "Female", "locale": "ja-JP", "category": "Asian Languages"},
    {"id": "ja-JP-KeitaNeural", "name": "Keita (Japanese, Calm & Natural)", "gender": "Male", "locale": "ja-JP", "category": "Asian Languages"},
    {"id": "ko-KR-SunHiNeural", "name": "Sun-Hi (Korean, Clear)", "gender": "Female", "locale": "ko-KR", "category": "Asian Languages"},
    {"id": "zh-CN-XiaoxiaoNeural", "name": "Xiaoxiao (Chinese Mandarin, Expressive)", "gender": "Female", "locale": "zh-CN", "category": "Asian Languages"},
    {"id": "zh-CN-YunxiNeural", "name": "Yunxi (Chinese Mandarin, Dynamic)", "gender": "Male", "locale": "zh-CN", "category": "Asian Languages"}
]


class LocalLibraryHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BUNDLE_DIR), **kwargs)

    def translate_path(self, path):
        # Clean query string
        clean = path.split("?")[0]
        # Route /backups/ requests directly to user's BACKUP_DIR on disk
        if clean.startswith("/backups/"):
            rel = clean[len("/backups/"):].lstrip("/")
            return str(BACKUP_DIR / rel)
        # Route /audio/ or /api/audio/ requests directly to user's AUDIO_DIR on disk
        if clean.startswith("/audio/"):
            rel = clean[len("/audio/"):].lstrip("/")
            return str(AUDIO_DIR / rel)
        if clean.startswith("/api/audio/"):
            rel = clean[len("/api/audio/"):].lstrip("/")
            return str(AUDIO_DIR / rel)
        if clean.startswith("/subtitles/"):
            rel = clean[len("/subtitles/"):].lstrip("/")
            return str(SUBTITLES_DIR / rel)
        # Check if file exists in EXE_DIR (allows user customization outside the bundle)
        exe_target = EXE_DIR / clean.lstrip("/")
        if exe_target.exists() and not exe_target.is_dir():
            return str(exe_target)
        return super().translate_path(path)

    def end_headers(self):
        # Enable CORS for local cross-origin development flexibility
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.path.split("?")[0].endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/save-backup":
            self.handle_save_backup()
        elif clean_path == "/api/update-backup":
            self.handle_update_backup()
        elif clean_path == "/api/log":
            self.handle_log()
        elif clean_path in ("/api/open-folder", "/api/open-logs", "/api/open-audio"):
            self.handle_open_folder()
        elif clean_path == "/api/tts/generate":
            self.handle_tts_generate()
        elif clean_path == "/api/tts/delete":
            self.handle_tts_delete()
        elif clean_path == "/api/srt/generate":
            self.handle_srt_generate()
        elif clean_path == "/api/srt/save":
            self.handle_srt_save()
        elif clean_path == "/api/srt/delete":
            self.handle_srt_delete()
        else:
            self.send_json_response({"success": False, "error": f"Endpoint not found: {clean_path}"}, 404)

    def handle_open_folder(self):
        target_dir = LOGS_DIR
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            clean_path = self.path.split("?")[0].rstrip("/")
            folder_target = "audio" if clean_path == "/api/open-audio" else "logs"
            if content_length > 0:
                body = self.rfile.read(content_length)
                try:
                    payload = json.loads(body.decode("utf-8"))
                    folder_target = payload.get("folder", folder_target)
                except Exception:
                    pass

            if folder_target == "audio":
                target_dir = AUDIO_DIR
            elif folder_target == "subtitles":
                target_dir = SUBTITLES_DIR
            elif folder_target == "backups":
                target_dir = BACKUP_DIR
            else:
                target_dir = LOGS_DIR
            target_dir.mkdir(parents=True, exist_ok=True)

            opened = False
            if sys.platform.startswith("win"):
                try:
                    os.startfile(str(target_dir))
                    opened = True
                except Exception:
                    try:
                        import subprocess
                        subprocess.Popen(["explorer", str(target_dir)])
                        opened = True
                    except Exception:
                        pass
            elif sys.platform.startswith("darwin"):
                import subprocess
                subprocess.Popen(["open", str(target_dir)])
                opened = True
            else:
                import subprocess
                subprocess.Popen(["xdg-open", str(target_dir)])
                opened = True

            print(f"[Folder] Opened in Explorer: {target_dir}")
            self.send_json_response({
                "success": True,
                "opened": opened,
                "path": str(target_dir)
            })
        except Exception as e:
            print(f"[Folder Error] Could not open {target_dir}: {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_log(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            today_str = datetime.now().strftime("%Y-%m-%d")
            log_file = LOGS_DIR / f"app-{today_str}.log"

            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            tab = payload.get("tab", "app")
            action = payload.get("action", "")
            details = payload.get("details", None)

            detail_str = ""
            if details is not None:
                if isinstance(details, (dict, list)):
                    try:
                        detail_str = f" | Details: {json.dumps(details, ensure_ascii=False)}"
                    except Exception:
                        detail_str = f" | Details: {str(details)}"
                else:
                    detail_str = f" | Details: {str(details)}"

            line = f"[{timestamp}] [{tab}] {action}{detail_str}\n"

            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass

            print(f"[Log] [{tab}] {action}")
            self.send_json_response({"success": True, "file": log_file.name})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_update_backup(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            data = payload.get("data")
            if not data:
                self.send_json_response({"success": False, "error": "Missing backup data"}, 400)
                return

            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            overwrite = payload.get("overwrite", False)
            target_filename = payload.get("filename")

            if overwrite and target_filename and (BACKUP_DIR / target_filename).exists():
                filename = target_filename
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"library-backup-{timestamp}.json"

            backup_path = BACKUP_DIR / filename
            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            cleaned_up = cleanup_old_backups()
            print(f"[Backup Update] Saved to: {backup_path}")
            self.send_json_response({
                "success": True,
                "filename": filename,
                "path": str(backup_path),
                "overwritten": overwrite,
                "cleanedUp": cleaned_up
            })
        except Exception as e:
            print(f"[Backup Update Error] {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_save_backup(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))

            BACKUP_DIR.mkdir(parents=True, exist_ok=True)

            query_str = self.path.split("?")[1] if "?" in self.path else ""
            is_auto = "auto=1" in query_str
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = "library-backup-auto.json" if is_auto else f"library-backup-{timestamp}.json"
            backup_path = BACKUP_DIR / filename

            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            cleaned_up = cleanup_old_backups()
            tag = "Auto-Backup" if is_auto else "Backup"
            print(f"[{tag}] Successfully saved: {backup_path} ({len(body)} bytes)")

            self.send_json_response({
                "success": True,
                "filename": filename,
                "path": str(backup_path),
                "mtime": backup_path.stat().st_mtime,
                "timestamp": timestamp,
                "auto": is_auto,
                "cleanedUp": cleaned_up
            })

        except Exception as e:
            print(f"[Backup Error] {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def do_GET(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/api/status":
            self.send_json_response({
                "status": "online",
                "app": "Panda Studio",
                "host": CURRENT_HOST,
                "port": CURRENT_PORT,
                "url": f"http://localhost:{CURRENT_PORT}",
                "backup_dir": str(BACKUP_DIR),
                "logs_dir": str(LOGS_DIR),
                "audio_dir": str(AUDIO_DIR),
                "subtitles_dir": str(SUBTITLES_DIR)
            })
            return
        elif clean_path == "/api/latest-backup":
            self.handle_get_latest_backup()
            return
        elif clean_path == "/api/logs":
            self.handle_get_logs()
            return
        elif clean_path in ("/api/open-folder", "/api/open-logs", "/api/open-audio"):
            self.handle_open_folder()
            return
        elif clean_path == "/api/tts/voices":
            self.handle_get_tts_voices()
            return
        elif clean_path == "/api/tts/history":
            self.handle_get_tts_history()
            return
        elif clean_path == "/api/srt/history":
            self.handle_get_srt_history()
            return
        elif clean_path == "/api/srt/progress":
            self.handle_get_srt_progress()
            return
        if clean_path.startswith("/subtitles/"):
            self.handle_srt_download()
            return
        if clean_path.startswith("/audio/") or clean_path.startswith("/api/audio/"):
            self.handle_audio_stream()
            return
        if clean_path.startswith("/api/"):
            self.send_json_response({"success": False, "error": f"Endpoint not found: {clean_path}"}, 404)
            return
        super().do_GET()

    def do_HEAD(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path.startswith("/audio/") or clean_path.startswith("/api/audio/"):
            self.handle_audio_stream(is_head=True)
            return
        super().do_HEAD()

    def handle_audio_stream(self, is_head=False):
        clean_path = self.path.split("?")[0]
        if clean_path.startswith("/api/audio/"):
            filename = clean_path[len("/api/audio/"):].lstrip("/")
        elif clean_path.startswith("/audio/"):
            filename = clean_path[len("/audio/"):].lstrip("/")
        else:
            filename = Path(clean_path).name

        clean_filename = Path(filename).name
        target_file = AUDIO_DIR / clean_filename
        if not target_file.exists():
            fallback = EXE_DIR.parent / "audio" / clean_filename
            if fallback.exists():
                target_file = fallback

        if not target_file.exists() or not target_file.is_file():
            self.send_error(404, f"Audio file not found: {clean_filename}")
            return

        file_size = target_file.stat().st_size
        query_str = self.path.split("?")[1] if "?" in self.path else ""
        is_download = "download=1" in query_str or "download=" in query_str

        range_header = self.headers.get("Range")
        start = 0
        end = file_size - 1
        status_code = 200

        if range_header and range_header.startswith("bytes="):
            try:
                ranges = range_header[len("bytes="):].split("-")
                if ranges[0]:
                    start = int(ranges[0])
                if len(ranges) > 1 and ranges[1]:
                    end = int(ranges[1])
                if start > end or start >= file_size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.end_headers()
                    return
                status_code = 206
            except ValueError:
                start = 0
                end = file_size - 1
                status_code = 200

        content_length = (end - start) + 1

        self.send_response(status_code)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "no-cache")

        if status_code == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")

        if is_download:
            self.send_header("Content-Disposition", f'attachment; filename="{clean_filename}"')

        self.end_headers()

        if is_head:
            return

        try:
            with open(target_file, "rb") as f:
                if start > 0:
                    f.seek(start)
                remaining = content_length
                chunk_size = 65536
                while remaining > 0:
                    read_bytes = min(remaining, chunk_size)
                    buf = f.read(read_bytes)
                    if not buf:
                        break
                    self.wfile.write(buf)
                    remaining -= len(buf)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            print(f"[Audio Stream Warning] {clean_filename}: {e}")

    def handle_get_latest_backup(self):
        try:
            if not BACKUP_DIR.exists():
                self.send_json_response({"success": False, "error": "Backups directory does not exist yet."})
                return

            backup_files = sorted(
                list(BACKUP_DIR.glob("library-backup-*.json")) or list(BACKUP_DIR.glob("*.json")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            # Filter out non-backup files (ensure it has items and groups)
            valid_backups = []
            for bf in backup_files:
                try:
                    with open(bf, "r", encoding="utf-8") as f:
                        test_load = json.load(f)
                    if isinstance(test_load, dict) and "items" in test_load and "groups" in test_load:
                        valid_backups.append((bf, test_load))
                except Exception:
                    continue

            if not valid_backups:
                self.send_json_response({"success": False, "error": "No valid backup JSON files found."})
                return

            latest_file, data = valid_backups[0]

            self.send_json_response({
                "success": True,
                "filename": latest_file.name,
                "mtime": latest_file.stat().st_mtime,
                "data": data
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_get_logs(self):
        try:
            if not LOGS_DIR.exists():
                self.send_json_response({"success": True, "files": [], "logs_dir": str(LOGS_DIR)})
                return

            log_files = sorted(
                list(LOGS_DIR.glob("*.log")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            files_meta = [{"name": f.name, "size": f.stat().st_size, "mtime": f.stat().st_mtime} for f in log_files]
            self.send_json_response({
                "success": True,
                "files": files_meta,
                "logs_dir": str(LOGS_DIR)
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def send_json_response(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_get_tts_voices(self):
        try:
            self.send_json_response({
                "success": True,
                "voices": VOICE_CATALOG,
                "total": len(VOICE_CATALOG),
                "defaultVoice": "en-US-JennyNeural"
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_get_tts_history(self):
        try:
            dirs_to_scan = [AUDIO_DIR]
            parent_audio = EXE_DIR.parent / "audio"
            if parent_audio.exists() and parent_audio.resolve() != AUDIO_DIR.resolve():
                dirs_to_scan.append(parent_audio)

            seen_names = set()
            mp3_files = []
            for d in dirs_to_scan:
                if d.exists():
                    for p in d.glob("*.mp3"):
                        if p.name not in seen_names:
                            seen_names.add(p.name)
                            mp3_files.append(p)

            mp3_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

            history = []
            for f in mp3_files:
                meta_file = f.with_suffix(".json")
                item = {
                    "filename": f.name,
                    "url": f"/audio/{f.name}",
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                    "createdAt": int(f.stat().st_mtime * 1000),
                    "voice": "en-US-JennyNeural",
                    "text": ""
                }
                if meta_file.exists():
                    try:
                        with open(meta_file, "r", encoding="utf-8") as mf:
                            loaded_meta = json.load(mf)
                            item.update(loaded_meta)
                    except Exception:
                        pass
                history.append(item)

            self.send_json_response({
                "success": True,
                "files": history,
                "audio_dir": str(AUDIO_DIR)
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_tts_delete(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))
            filename = payload.get("filename", "").strip()

            if not filename:
                self.send_json_response({"success": False, "error": "Filename required"}, 400)
                return

            clean_name = Path(filename).name
            target = AUDIO_DIR / clean_name
            meta_target = target.with_suffix(".json")

            deleted = False
            if target.exists():
                target.unlink()
                deleted = True
            if meta_target.exists():
                meta_target.unlink()

            print(f"[TTS Delete] Deleted: {clean_name}")
            self.send_json_response({"success": True, "deleted": deleted, "filename": clean_name})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_tts_generate(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty request body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            text = payload.get("text", "").strip()
            if not text:
                self.send_json_response({"success": False, "error": "Text is required to generate speech"}, 400)
                return

            voice = payload.get("voice", "en-US-JennyNeural").strip() or "en-US-JennyNeural"
            rate = normalize_rate(payload.get("rate", "+0%"))
            pitch = normalize_pitch(payload.get("pitch", "+0Hz"))
            volume = payload.get("volume", "+0%").strip() or "+0%"

            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            voice_short = voice.split("-")[-1].replace("Neural", "").lower()

            custom_name = payload.get("filename", "").strip()
            if custom_name:
                base_clean = "".join(c for c in custom_name if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")
                if not base_clean:
                    base_clean = f"tts_{timestamp_str}_{voice_short}"
                filename = f"{base_clean}.mp3" if not base_clean.lower().endswith(".mp3") else base_clean
            else:
                filename = f"tts_{timestamp_str}_{voice_short}.mp3"

            output_file = AUDIO_DIR / filename
            counter = 1
            stem = output_file.stem
            while output_file.exists():
                output_file = AUDIO_DIR / f"{stem}_{counter}.mp3"
                counter += 1
            filename = output_file.name

            # Generate speech using edge-tts
            try:
                import edge_tts
                import asyncio

                # Detect if text contains non-Latin scripts and auto-select a matching voice
                def _detect_script_mismatch(txt, vc):
                    """Check if text script doesn't match the voice locale."""
                    import unicodedata
                    non_latin = 0
                    latin = 0
                    devanagari = 0
                    for ch in txt:
                        if ch.isalpha():
                            try:
                                name = unicodedata.name(ch, "")
                            except ValueError:
                                name = ""
                            if "DEVANAGARI" in name:
                                devanagari += 1
                                non_latin += 1
                            elif "LATIN" in name:
                                latin += 1
                            else:
                                non_latin += 1

                    total = latin + non_latin
                    if total == 0:
                        return None, None

                    # If majority is Devanagari (Hindi) but voice is not hi-IN, suggest Hindi voice
                    if devanagari > latin and not vc.startswith("hi-IN"):
                        return "hi-IN-SwaraNeural", "Hindi text detected but an English voice was selected. Auto-switching to Hindi voice."

                    return None, None

                fallback_voice, mismatch_msg = _detect_script_mismatch(text, voice)
                actual_voice = voice

                async def _speak(v):
                    communicate = edge_tts.Communicate(
                        text=text,
                        voice=v,
                        rate=rate,
                        pitch=pitch,
                        volume=volume
                    )
                    await communicate.save(str(output_file))

                try:
                    asyncio.run(_speak(voice))
                except Exception as first_err:
                    # If the selected voice failed and we have a fallback, try it
                    if fallback_voice and fallback_voice != voice:
                        print(f"[TTS] Primary voice '{voice}' failed ({first_err}). Retrying with '{fallback_voice}'...")
                        actual_voice = fallback_voice
                        asyncio.run(_speak(fallback_voice))
                    else:
                        raise first_err

                # Update voice to what was actually used (for metadata)
                if actual_voice != voice:
                    print(f"[TTS] Used fallback voice: {actual_voice} (original: {voice})")
                    voice = actual_voice

            except ImportError:
                self.send_json_response({
                    "success": False,
                    "error": "The 'edge-tts' package is missing. Please run 'pip install edge-tts'."
                }, 500)
                return
            except Exception as tts_err:
                err_msg = str(tts_err)
                print(f"[TTS Error] Generation failed: {err_msg}")

                # Give a helpful hint if it's the "No audio" error
                if "No audio was received" in err_msg:
                    hint = ("The selected voice may not support this text's language/script. "
                            "For Hindi text, use a Hindi voice (e.g. Swara or Madhur). "
                            "For English text, use an English voice.")
                else:
                    hint = "Please verify your internet connection."

                self.send_json_response({
                    "success": False,
                    "error": f"TTS synthesis failed: {err_msg}. {hint}"
                }, 500)
                return

            if not output_file.exists() or output_file.stat().st_size == 0:
                self.send_json_response({
                    "success": False,
                    "error": "Audio file was not generated or is empty."
                }, 500)
                return

            file_size = output_file.stat().st_size
            now_ms = int(datetime.now().timestamp() * 1000)

            # Save metadata .json alongside the .mp3
            meta = {
                "filename": filename,
                "voice": voice,
                "text": text,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "size": file_size,
                "createdAt": now_ms
            }
            meta_path = output_file.with_suffix(".json")
            try:
                with open(meta_path, "w", encoding="utf-8") as mf:
                    json.dump(meta, mf, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[TTS Warning] Could not save metadata: {e}")

            print(f"[TTS] Generated audio: {filename} ({file_size} bytes, voice: {voice})")

            self.send_json_response({
                "success": True,
                "filename": filename,
                "url": f"/audio/{filename}",
                "size": file_size,
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "text": text,
                "createdAt": now_ms
            })

        except Exception as e:
            print(f"[TTS Error] Request failed: {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_get_srt_progress(self):
        from urllib.parse import parse_qs
        query_str = self.path.split("?")[1] if "?" in self.path else ""
        params = parse_qs(query_str)
        job_id = params.get("jobId", [""])[0]
        job = _SRT_JOBS.get(job_id, {
            "status": "pending",
            "percent": 0,
            "stage": "Waiting...",
            "detail": ""
        })
        self.send_json_response({"success": True, **job})

    def handle_get_srt_history(self):
        try:
            SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
            srt_files = sorted(
                list(SUBTITLES_DIR.glob("*.srt")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            history = []
            for f in srt_files:
                preview = ""
                try:
                    with open(f, "r", encoding="utf-8") as sf:
                        preview = sf.read(300)
                except Exception:
                    pass
                history.append({
                    "filename": f.name,
                    "url": f"/subtitles/{f.name}",
                    "size": f.stat().st_size,
                    "createdAt": int(f.stat().st_mtime * 1000),
                    "preview": preview
                })
            self.send_json_response({
                "success": True,
                "files": history,
                "subtitles_dir": str(SUBTITLES_DIR)
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_srt_download(self):
        clean_path = self.path.split("?")[0]
        filename = Path(clean_path[len("/subtitles/"):].lstrip("/")).name
        target_file = SUBTITLES_DIR / filename
        if not target_file.exists() or not target_file.is_file():
            self.send_error(404, f"Subtitle file not found: {filename}")
            return

        data = target_file.read_bytes()
        query_str = self.path.split("?")[1] if "?" in self.path else ""
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if "download=1" in query_str:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def handle_srt_save(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            filename = Path(payload.get("filename", "")).name
            srt_text = payload.get("srtText", "")
            if not filename or not filename.lower().endswith(".srt"):
                self.send_json_response({"success": False, "error": "Invalid .srt filename"}, 400)
                return
            SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
            target = SUBTITLES_DIR / filename
            target.write_text(srt_text, encoding="utf-8")
            self.send_json_response({
                "success": True,
                "filename": filename,
                "size": target.stat().st_size,
                "url": f"/subtitles/{filename}"
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_srt_delete(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            filename = Path(payload.get("filename", "")).name
            target = SUBTITLES_DIR / filename
            deleted = False
            if target.exists() and target.is_file():
                target.unlink()
                deleted = True
            self.send_json_response({"success": True, "deleted": deleted, "filename": filename})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_srt_generate(self):
        import tempfile
        import subprocess
        from urllib.parse import parse_qs

        temp_media_path = None
        temp_wav_path = None
        job_id = ""

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "No media file received"}, 400)
                return

            query_str = self.path.split("?")[1] if "?" in self.path else ""
            params = parse_qs(query_str)
            orig_name = Path(params.get("filename", ["video.mp4"])[0]).name
            model_size = params.get("model", ["base"])[0].strip() or "base"
            language = params.get("language", ["auto"])[0].strip() or "auto"
            task = params.get("task", ["transcribe"])[0].strip() or "transcribe"
            vad_filter = params.get("vad", ["1"])[0] != "0"
            job_id = params.get("jobId", [""])[0].strip()

            update_srt_job(job_id, status="running", percent=15, stage="Saving uploaded media...", detail=orig_name)

            if model_size not in ("tiny", "base", "small", "medium", "large-v3", "large-v3-turbo"):
                model_size = "small"
            if task not in ("transcribe", "translate"):
                task = "transcribe"

            ext = Path(orig_name).suffix or ".mp4"
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tf:
                temp_media_path = tf.name
                remaining = content_length
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        break
                    tf.write(chunk)
                    remaining -= len(chunk)

            # Extract 16kHz mono WAV via ffmpeg and load as float32 numpy array (bypasses PyAV metadata_errors bug)
            audio_input = temp_media_path
            ffmpeg_bin = find_ffmpeg_bin()
            if ffmpeg_bin:
                update_srt_job(job_id, percent=22, stage="Extracting audio track with ffmpeg...", detail="Converting to 16kHz mono WAV")
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as wf:
                    temp_wav_path = wf.name
                cmd = [
                    ffmpeg_bin, "-y", "-i", temp_media_path,
                    "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                    temp_wav_path
                ]
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if proc.returncode == 0 and Path(temp_wav_path).stat().st_size > 0:
                    import wave
                    import numpy as np
                    with wave.open(temp_wav_path, "rb") as w:
                        audio_input = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

            try:
                from faster_whisper import WhisperModel
            except ImportError:
                update_srt_job(job_id, status="error", stage="faster-whisper not installed")
                self.send_json_response({
                    "success": False,
                    "error": "The 'faster-whisper' package is not installed. Run 'python -m pip install faster-whisper'."
                }, 500)
                return

            if model_size not in _WHISPER_MODELS:
                update_srt_job(
                    job_id,
                    percent=28,
                    stage=f"Loading Whisper '{model_size}' model...",
                    detail="First run downloads the model once; future runs are 100% offline."
                )
                print(f"[SRT] Loading Whisper model '{model_size}' (int8, CPU)...")
                _WHISPER_MODELS[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
            model = _WHISPER_MODELS[model_size]

            update_srt_job(job_id, percent=35, stage="Analyzing audio & detecting speech...", detail=f"Model: {model_size}")
            lang_arg = None if language == "auto" else language
            custom_hint = params.get("hint", [""])[0].strip()
            initial_prompt = custom_hint or None
            if language == "hi" and task == "transcribe" and not initial_prompt:
                initial_prompt = "यह हिंदी भाषा में शुद्ध देवनागरी लिपि का स्पष्ट पाठ है।"

            print(f"[SRT] Transcribing '{orig_name}' (model={model_size}, lang={language}, task={task}, vad={vad_filter})...")
            segments_iter, info = model.transcribe(
                audio_input,
                language=lang_arg,
                task=task,
                vad_filter=vad_filter,
                beam_size=5,
                initial_prompt=initial_prompt
            )

            total_dur = max(float(info.duration or 0), 0.1)
            segments = []
            srt_blocks = []
            for idx, seg in enumerate(segments_iter, start=1):
                text_clean = (seg.text or "").strip()
                if text_clean:
                    start_ts = format_srt_timestamp(seg.start)
                    end_ts = format_srt_timestamp(seg.end)
                    segments.append({
                        "index": len(segments) + 1,
                        "start": seg.start,
                        "end": seg.end,
                        "startTs": start_ts,
                        "endTs": end_ts,
                        "text": text_clean
                    })
                    srt_blocks.append(f"{len(segments)}\n{start_ts} --> {end_ts}\n{text_clean}")

                ratio = min(1.0, float(seg.end or 0) / total_dur)
                pct = 35 + int(60 * ratio)
                update_srt_job(
                    job_id,
                    percent=pct,
                    stage=f"Transcribing speech... ({len(segments)} lines)",
                    detail=f"{format_srt_timestamp(seg.end or 0)[:8]} / {format_srt_timestamp(total_dur)[:8]} • Lang: {info.language}"
                )

            srt_text = "\n\n".join(srt_blocks) + ("\n" if srt_blocks else "")

            SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
            stem = Path(orig_name).stem or "subtitles"
            suffix = "_en" if task == "translate" else ""
            out_name = f"{stem}{suffix}.srt"
            out_path = SUBTITLES_DIR / out_name
            out_path.write_text(srt_text, encoding="utf-8")

            update_srt_job(job_id, status="done", percent=100, stage=f"Complete! Generated {len(segments)} subtitle lines", detail=out_name)
            print(f"[SRT] Generated {out_name} ({len(segments)} segments, lang={info.language})")
            self.send_json_response({
                "success": True,
                "filename": out_name,
                "url": f"/subtitles/{out_name}",
                "srtText": srt_text,
                "segments": segments,
                "detectedLanguage": info.language,
                "languageProbability": round(float(info.language_probability or 0), 3),
                "duration": round(float(info.duration or 0), 2),
                "size": out_path.stat().st_size
            })
        except Exception as e:
            print(f"[SRT Error] {e}")
            update_srt_job(job_id, status="error", stage="Transcription failed", detail=str(e))
            self.send_json_response({"success": False, "error": str(e)}, 500)
        finally:
            for p in (temp_media_path, temp_wav_path):
                if p and os.path.exists(p):
                    try:
                        os.unlink(p)
                    except Exception:
                        pass


def load_configuration(cli_args=None):
    """
    Resolves host and port configuration using precedence:
    1. CLI arguments (-p, --port, or positional port)
    2. Environment variables (PORT, PANDA_PORT, HOST)
    3. config.json in root directory
    4. Default: host 127.0.0.1, port 6700
    """
    global CURRENT_HOST, CURRENT_PORT, MAX_BACKUP_FILES

    host = DEFAULT_HOST
    port = DEFAULT_PORT
    auto_open = True
    config_source = f"default ({DEFAULT_PORT})"

    # 1. Check config.json if present (check user's EXE directory first, fallback to bundle)
    target_config = CONFIG_FILE if CONFIG_FILE.exists() else (BUNDLE_DIR / "config.json")
    if target_config.exists():
        try:
            with open(target_config, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if isinstance(cfg, dict):
                if "port" in cfg and isinstance(cfg["port"], (int, str)):
                    port = int(cfg["port"])
                    config_source = f"config.json ({target_config.name})"
                if "host" in cfg and isinstance(cfg["host"], str):
                    host = cfg["host"]
                if "auto_open_browser" in cfg:
                    auto_open = bool(cfg["auto_open_browser"])
                if "max_backup_files" in cfg and isinstance(cfg["max_backup_files"], (int, str)):
                    MAX_BACKUP_FILES = max(1, int(cfg["max_backup_files"]))
        except Exception as e:
            print(f"[Config Warning] Could not parse config.json: {e}")

    # 2. Check environment variables
    env_port = os.environ.get("PORT") or os.environ.get("PANDA_PORT")
    if env_port:
        try:
            port = int(env_port)
            config_source = f"environment variable (PORT={env_port})"
        except ValueError:
            pass

    env_host = os.environ.get("HOST") or os.environ.get("PANDA_HOST")
    if env_host:
        host = env_host

    # 3. Check CLI arguments
    import argparse
    parser = argparse.ArgumentParser(description="Panda Studio Local Server")
    parser.add_argument("port_pos", nargs="?", type=int, help="Port number (e.g. 6700)")
    parser.add_argument("-p", "--port", type=int, help="Port number (e.g. 6700)")
    parser.add_argument("-H", "--host", type=str, help="Host address (default: 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser on startup")

    parsed, _ = parser.parse_known_args(cli_args)
    cli_port = parsed.port or parsed.port_pos
    if cli_port:
        port = cli_port
        config_source = f"command-line argument (--port {port})"

    if parsed.host:
        host = parsed.host

    if parsed.no_browser:
        auto_open = False

    CURRENT_HOST = host
    CURRENT_PORT = port

    return host, port, auto_open, config_source


def main():
    host, port, auto_open, source = load_configuration()

    print()
    print("=" * 60)
    print(" 🐼 Panda Studio - Content Creation Platform")
    print("=" * 60)
    print(f" Directory  : {BASE_DIR}")
    print(f" Backups    : {BACKUP_DIR}")
    print(f" Logs       : {LOGS_DIR}")
    print(f" Port Source: {source}")
    print(f" Local URL  : http://localhost:{port}")
    print(f" Network    : http://{host}:{port}")
    print("=" * 60)
    print(" Press Ctrl+C in this terminal window to stop.")
    print("=" * 60)
    print()

    server = ThreadingHTTPServer((host, port), LocalLibraryHandler)
    if auto_open:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server gracefully...")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
