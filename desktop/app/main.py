import threading
import time
import os
import sys
import multiprocessing
import subprocess
import webview


def bundled_resource(*parts):
    root = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, *parts)


def configure_bundled_tools():
    tools_dir = bundled_resource("tools")
    if os.path.isdir(tools_dir):
        os.environ["PATH"] = tools_dir + os.pathsep + os.environ.get("PATH", "")
    return tools_dir


if "--qsuene-runtime-check" in sys.argv:
    configure_bundled_tools()
    from spotdl.console.entry_point import console_entry_point as _spotdl_entry_point  # noqa: F401
    ffmpeg_check = subprocess.run(
        ["ffmpeg", "-version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    raise SystemExit(ffmpeg_check.returncode)

if "--qsuene-spotdl" in sys.argv:
    configure_bundled_tools()
    marker_index = sys.argv.index("--qsuene-spotdl")
    sys.argv = [sys.argv[0], *sys.argv[marker_index + 1:]]
    from spotdl.console.entry_point import console_entry_point as _spotdl_entry_point
    _spotdl_entry_point()
    raise SystemExit(0)

# Add app directory to path to ensure import server works when run from root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server import app
from download_worker import recover_interrupted, run_forever


def start_download_worker():
    recover_interrupted()
    run_forever()


def start_flask():
    # Run the server on port 5001 without debug/reloader
    app.run(host='127.0.0.1', port=5001, debug=False, threaded=True)

def setup_native_window_style():
    """Applies the custom application icon and native DWM title bar styling on Windows."""
    if sys.platform != "win32":
        return

    import ctypes

    user32 = getattr(ctypes.windll, "user32", None)
    dwmapi = getattr(ctypes.windll, "dwmapi", None)
    if not user32:
        return

    # Wait for the native window to be displayed
    time.sleep(0.4)
    hwnd = 0
    for _ in range(30):
        hwnd = user32.FindWindowW(None, "Q'Suene")
        if hwnd:
            break
        time.sleep(0.15)

    if not hwnd:
        return

    # 1. Set window corner and taskbar icons from generated icon.ico
    icon_path = bundled_resource("app", "icon.ico")
    if os.path.exists(icon_path):
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        
        h_icon_big = user32.LoadImageW(None, icon_path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
        h_icon_small = user32.LoadImageW(None, icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
        
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1
        
        if h_icon_small:
            user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_icon_small)
        if h_icon_big:
            user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_icon_big)

    # 2. Set DWM title bar styling in harmony with app dark theme (Windows 11+)
    if dwmapi:
        def rgb_to_colorref(r, g, b):
            return (b << 16) | (g << 8) | r

        DWMWA_CAPTION_COLOR = 35
        DWMWA_TEXT_COLOR = 36

        try:
            # Fondo de la barra de título integrado con la identidad oscura de Q'Suene (#19110b)
            caption_color = ctypes.c_uint32(rgb_to_colorref(25, 17, 11))
            dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ctypes.byref(caption_color), ctypes.sizeof(caption_color))

            # Color del texto del título (#fafafa)
            text_color = ctypes.c_uint32(rgb_to_colorref(250, 250, 250))
            dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ctypes.byref(text_color), ctypes.sizeof(text_color))
        except Exception:
            pass

if __name__ == '__main__':
    multiprocessing.freeze_support()
    worker_process = multiprocessing.Process(target=start_download_worker, daemon=True)
    worker_process.start()
    # Start Flask in a background daemon thread
    t = threading.Thread(target=start_flask)
    t.daemon = True
    t.start()
    
    # Start native style setup in background
    style_thread = threading.Thread(target=setup_native_window_style)
    style_thread.daemon = True
    style_thread.start()
    
    # Wait a moment for Flask to initialize
    time.sleep(0.5)
    
    icon_path = bundled_resource("app", "icon.ico")
    
    # Create webview window
    webview.create_window(
        title="Q'Suene",
        url="http://127.0.0.1:5001",
        width=1250,
        height=820,
        resizable=True,
        min_size=(950, 650),
        # Tono de precarga integrado con la identidad oscura de Q'Suene
        background_color="#19110b"
    )
    
    # Start webview loop (blocks until window is closed)
    try:
        webview.start(icon=icon_path if os.path.exists(icon_path) else None)
    finally:
        worker_process.terminate()
        worker_process.join(timeout=3)
