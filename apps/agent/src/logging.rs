use netmate_core::{
    journal::{Journal, LogWrite},
    model::Snapshot,
};
use serde_json::Value;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
    mpsc::{SyncSender, sync_channel},
};
#[derive(Clone)]
pub struct Sink {
    tx: SyncSender<(String, String)>,
    dropped: Arc<AtomicUsize>,
}
impl Sink {
    pub fn new(journal: Arc<Mutex<Journal>>, state: tokio::sync::watch::Sender<Snapshot>) -> Self {
        let (tx, rx) = sync_channel::<(String, String)>(128);
        let dropped = Arc::new(AtomicUsize::new(0));
        let count = dropped.clone();
        std::thread::spawn(move || {
            while let Ok(first) = rx.recv() {
                let mut batch = vec![first];
                batch.extend(rx.try_iter().take(63));
                let mut entries: Vec<_> = batch
                    .into_iter()
                    .map(|(level, message)| LogWrite {
                        level,
                        message,
                        source: "network".into(),
                        data: Value::Null,
                    })
                    .collect();
                let skipped = count.swap(0, Ordering::Relaxed);
                if skipped > 0 {
                    entries.push(LogWrite {
                        level: "warn".into(),
                        source: "logging".into(),
                        message: format!("日志队列已满或写入失败，省略 {skipped} 条记录"),
                        data: Value::Null,
                    });
                }
                if journal.lock().unwrap().append_batch(&entries).is_err() {
                    count.fetch_add(entries.len() + skipped, Ordering::Relaxed);
                } else {
                    state.send_modify(|s| {
                        s.log_revision += 1;
                        s.sequence += 1;
                    });
                }
            }
        });
        Self { tx, dropped }
    }
    pub fn write(&self, level: &str, message: &str) {
        let mut message = message.to_string();
        if message.len() > 4096 {
            let mut end = 4096;
            while !message.is_char_boundary(end) {
                end -= 1;
            }
            message.truncate(end);
        }
        if self.tx.try_send((level.to_string(), message)).is_err() {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}
