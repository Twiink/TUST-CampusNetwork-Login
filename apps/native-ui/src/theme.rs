//! Appearance belongs to the UI process; network configuration stays in the agent.
use netmate_core::store::{atomic_write, data_dir, private_dir};

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
