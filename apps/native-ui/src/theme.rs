//! Appearance belongs to the UI process; network configuration stays in the agent.
use netmate_core::store::{atomic_write, data_dir, private_dir};
use std::sync::{Condvar, Mutex};

pub fn saved_dark() -> Option<bool> {
    let value = std::fs::read_to_string(data_dir().ok()?.join("appearance-v1")).ok()?;
    match value.trim() {
        "dark" => Some(true),
        "light" => Some(false),
        _ => None,
    }
}
pub fn save(dark: bool) -> anyhow::Result<()> {
    let directory = data_dir()?;
    private_dir(&directory)?;
    atomic_write(
        &directory.join("appearance-v1"),
        if dark { b"dark" } else { b"light" },
    )
}
/// The newest unsaved choice; one writer thread drains it, so the newest choice is the
/// one left on disk.
static PENDING: Mutex<Option<bool>> = Mutex::new(None);
static WAKE: Condvar = Condvar::new();
static WRITER: std::sync::Once = std::sync::Once::new();
/// Saves off the UI thread: the atomic write syncs to disk, which would stall the
/// first frames of the toggle animation. `failed` runs on the writer thread.
pub fn save_later(dark: bool, failed: fn(String)) {
    *PENDING.lock().unwrap() = Some(dark);
    WAKE.notify_one();
    WRITER.call_once(|| {
        std::thread::spawn(move || {
            loop {
                let dark = {
                    let mut pending = PENDING.lock().unwrap();
                    loop {
                        if let Some(dark) = pending.take() {
                            break dark;
                        }
                        pending = WAKE.wait(pending).unwrap();
                    }
                };
                if let Err(error) = save(dark) {
                    failed(error.to_string());
                }
            }
        });
    });
}
