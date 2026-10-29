#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod client;
#[cfg(target_os = "linux")]
mod linux;
mod theme;
#[cfg(target_os = "windows")]
mod windows;
fn main() {
    // Native forms and virtual lists need no GPU renderer or shader compiler.
    // Set the default before any UI or worker thread is created; users can override it.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GSK_RENDERER").is_none() {
        unsafe {
            std::env::set_var("GSK_RENDERER", "cairo");
        }
    }

    #[cfg(target_os = "linux")]
    linux::run();
    #[cfg(target_os = "windows")]
    windows::run();
    #[cfg(target_os = "macos")]
    eprintln!("macOS 界面由 Swift AppKit 目标构建");
}
