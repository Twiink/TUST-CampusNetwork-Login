use crate::model::now;
use anyhow::{Result, bail};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{io::Write, path::Path};
const RETENTION: u64 = 7 * 24 * 3600 * 1000;
const BUDGET: u64 = 20 * 1024 * 1024;
#[derive(Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct LogQuery {
    pub cursor: Option<String>,
    pub limit: u32,
    pub level: String,
    pub source: String,
    pub keyword: String,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
}
pub struct Journal {
    db: Connection,
    pub generation: u64,
    bytes: u64,
    budget: u64,
    pending: u32,
}
pub struct LogWrite {
    pub level: String,
    pub source: String,
    pub message: String,
    pub data: Value,
}
impl Journal {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA auto_vacuum=INCREMENTAL; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-512; PRAGMA mmap_size=0; PRAGMA busy_timeout=3000; PRAGMA wal_autocheckpoint=128; PRAGMA journal_size_limit=1048576; PRAGMA max_page_count=8192;
  CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS logs_time ON logs(timestamp DESC,id DESC);
  CREATE INDEX IF NOT EXISTS logs_level ON logs(level,timestamp DESC,id DESC);
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES('generation',1);")?;
        let generation =
            db.query_row("SELECT value FROM meta WHERE key='generation'", [], |r| {
                r.get::<_, i64>(0).map(|n| n as u64)
            })?;
        let bytes = db.query_row("SELECT COALESCE(SUM(bytes),0) FROM logs", [], |r| {
            r.get::<_, i64>(0).map(|n| n as u64)
        })?;
        let mut journal = Self {
            db,
            generation,
            bytes,
            budget: BUDGET,
            pending: 0,
        };
        journal.prune()?;
        Ok(journal)
    }
    pub fn append(&mut self, level: &str, source: &str, message: &str, data: Value) -> Result<()> {
        self.append_batch(&[LogWrite {
            level: level.into(),
            source: source.into(),
            message: message.into(),
            data,
        }])
    }
    pub fn append_batch(&mut self, entries: &[LogWrite]) -> Result<()> {
        let tx = self.db.transaction()?;
        let mut added = 0;
        for entry in entries {
            let level = entry.level.as_str();
            let level = if ["debug", "info", "success", "warn", "error"].contains(&level) {
                level
            } else {
                "info"
            };
            let message = redact(&entry.message);
            let source = redact(&entry.source);
            let data = redact_value(entry.data.clone()).to_string();
            let size = (message.len() + source.len() + data.len()) as u64;
            if size > 64 * 1024 {
                bail!("单条日志超过 64 KiB")
            }
            tx.execute(
            "INSERT INTO logs(timestamp,level,source,message,data,bytes) VALUES(?1,?2,?3,?4,?5,?6)",
            params![now() as i64, level, source, message, data, size as i64],
        )?;
            added += size;
        }
        tx.commit()?;
        self.bytes += added;
        self.pending += entries.len() as u32;
        if self.bytes > self.budget || self.pending >= 256 {
            self.prune()?;
            self.pending = 0;
        }
        Ok(())
    }
    fn prune(&mut self) -> Result<()> {
        self.db.execute(
            "DELETE FROM logs WHERE timestamp < ?1",
            [now().saturating_sub(RETENTION) as i64],
        )?;
        self.bytes = self
            .db
            .query_row("SELECT COALESCE(SUM(bytes),0) FROM logs", [], |r| {
                r.get::<_, i64>(0).map(|n| n as u64)
            })?;
        while self.bytes > self.budget {
            let removed:u64=self.db.query_row("SELECT COALESCE(SUM(bytes),0) FROM (SELECT bytes FROM logs ORDER BY timestamp,id LIMIT 64)",[],|r|r.get::<_,i64>(0).map(|n|n as u64))?;
            self.db.execute(
                "DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY timestamp,id LIMIT 64)",
                [],
            )?;
            self.bytes = self.bytes.saturating_sub(removed);
        }
        self.db
            .execute_batch("PRAGMA wal_checkpoint(PASSIVE); PRAGMA incremental_vacuum(128);")?;
        Ok(())
    }
    pub fn query(&self, q: &LogQuery) -> Result<Value> {
        self.page(q, true)
    }
    fn page(&self, q: &LogQuery, include_total: bool) -> Result<Value> {
        let cursor = q
            .cursor
            .as_ref()
            .map(|s| serde_json::from_str::<(u64, u64, u64)>(s))
            .transpose()?;
        if cursor.is_some_and(|c| c.0 != self.generation) {
            bail!("日志已清空，请重新查询")
        }
        let (time, id) = cursor
            .map(|c| (c.1, c.2))
            .unwrap_or((i64::MAX as u64, i64::MAX as u64));
        let limit = if q.limit == 0 {
            200
        } else {
            q.limit.clamp(1, 200)
        };
        let sql = "SELECT id,timestamp,level,source,message,data FROM logs WHERE timestamp>=?1 AND timestamp<=?2 AND (?3='' OR level=?3) AND (?4='' OR instr(lower(source),lower(?4))>0) AND (?5='' OR instr(lower(message||' '||source||' '||data),lower(?5))>0) AND (timestamp<?6 OR (timestamp=?6 AND id<?7)) ORDER BY timestamp DESC,id DESC LIMIT ?8";
        let total = if include_total {
            self.db.query_row("SELECT COUNT(*) FROM logs WHERE timestamp>=?1 AND timestamp<=?2 AND (?3='' OR level=?3) AND (?4='' OR instr(lower(source),lower(?4))>0) AND (?5='' OR instr(lower(message||' '||source||' '||data),lower(?5))>0)", params![q.start_time.unwrap_or(0).max(now().saturating_sub(RETENTION)) as i64, q.end_time.unwrap_or(i64::MAX as u64) as i64, if q.level == "all" { "" } else { &q.level }, q.source, q.keyword], |row| row.get::<_,i64>(0))?
        } else {
            0
        };
        let mut st = self.db.prepare_cached(sql)?;
        let mut rows = st.query(params![
            q.start_time
                .unwrap_or(0)
                .max(now().saturating_sub(RETENTION)) as i64,
            q.end_time.unwrap_or(i64::MAX as u64) as i64,
            if q.level == "all" { "" } else { &q.level },
            q.source,
            q.keyword,
            time as i64,
            id as i64,
            limit + 1
        ])?;
        let mut entries = Vec::new();
        let mut size = 0;
        let mut has_more = false;
        while let Some(row) = rows.next()? {
            let entry = json!({"id":row.get::<_,i64>(0)?,"timestamp":row.get::<_,i64>(1)?,"level":row.get::<_,String>(2)?,"source":row.get::<_,String>(3)?,"message":row.get::<_,String>(4)?,"data":serde_json::from_str::<Value>(&row.get::<_,String>(5)?).unwrap_or(Value::Null),"generation":self.generation});
            size += entry.to_string().len();
            if entries.len() >= limit as usize || size > 1024 * 1024 {
                has_more = true;
                break;
            }
            entries.push(entry);
        }
        let next = entries.last().map(|e| {
            serde_json::to_string(&(
                self.generation,
                e["timestamp"].as_u64().unwrap(),
                e["id"].as_u64().unwrap(),
            ))
            .unwrap()
        });
        Ok(
            json!({"entries":entries,"nextCursor":next,"hasMore":has_more,"generation":self.generation,"total":total}),
        )
    }
    pub fn export(&self, q: &LogQuery, mut writer: impl Write, format: &str) -> Result<u64> {
        let mut page = q.clone();
        page.cursor = None;
        page.limit = 200;
        let mut count = 0;
        if format == "json" {
            writer.write_all(b"{\"app\":\"NetMate\",\"version\":\"2.0.0\",\"entries\":[")?
        } else {
            writeln!(
                writer,
                "NetMate 2.0.0 / {} / {}",
                std::env::consts::OS,
                std::env::consts::ARCH
            )?;
        }
        loop {
            let result = self.page(&page, false)?;
            for e in result["entries"].as_array().unwrap() {
                if format == "json" {
                    if count > 0 {
                        writer.write_all(b",")?
                    }
                    serde_json::to_writer(&mut writer, e)?;
                } else {
                    writeln!(
                        writer,
                        "{} [{}] [{}] {} {}",
                        e["timestamp"],
                        e["level"].as_str().unwrap_or(""),
                        e["source"].as_str().unwrap_or(""),
                        e["message"].as_str().unwrap_or(""),
                        e["data"]
                    )?;
                }
                count += 1;
            }
            if result["hasMore"] != true {
                break;
            }
            page.cursor = result["nextCursor"].as_str().map(str::to_owned);
        }
        if format == "json" {
            writer.write_all(b"]}\n")?;
        }
        writer.flush()?;
        Ok(count)
    }
    pub fn clear(&mut self) -> Result<u64> {
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM logs", [])?;
        tx.execute("UPDATE meta SET value=value+1 WHERE key='generation'", [])?;
        tx.commit()?;
        self.generation += 1;
        self.bytes = 0;
        self.db
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum;")?;
        Ok(self.generation)
    }
}
pub fn redact(text: &str) -> String {
    if text.contains("/eportal/portal/") {
        return "[门户请求地址已脱敏]".into();
    }
    static SECRETS: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r#"(?i)((?:password|user_password|passwd|psk|token|authorization|cookie|keyMaterial)\s*["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&\n]+)"#).unwrap()
    });
    SECRETS.replace_all(text, "${1}[REDACTED]").into_owned()
}
fn redact_value(v: Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(
            m.into_iter()
                .map(|(k, v)| {
                    let secret = [
                        "password",
                        "userpassword",
                        "user_password",
                        "passwd",
                        "psk",
                        "token",
                        "authorization",
                        "cookie",
                        "keymaterial",
                    ]
                    .contains(&k.to_lowercase().as_str());
                    (
                        k,
                        if secret {
                            json!("[REDACTED]")
                        } else {
                            redact_value(v)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(a) => Value::Array(a.into_iter().map(redact_value).collect()),
        Value::String(s) => json!(redact(&s)),
        other => other,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paging_clear_and_full_export() {
        let d = tempfile::tempdir().unwrap();
        let mut j = Journal::open(&d.path().join("logs.db")).unwrap();
        for i in 0..710 {
            j.append(
                "info",
                "test",
                &format!("记录{i}"),
                json!({"password":"secret"}),
            )
            .unwrap();
        }
        let p = j.query(&LogQuery::default()).unwrap();
        assert_eq!(p["entries"].as_array().unwrap().len(), 200);
        assert_eq!(p["total"], 710);
        let second = j
            .query(&LogQuery {
                cursor: p["nextCursor"].as_str().map(str::to_owned),
                ..LogQuery::default()
            })
            .unwrap();
        assert_eq!(second["total"], 710);
        let mut out = Vec::new();
        assert_eq!(
            j.export(&LogQuery::default(), &mut out, "json").unwrap(),
            710
        );
        assert!(!String::from_utf8(out).unwrap().contains("secret"));
        let cursor = p["nextCursor"].as_str().unwrap().to_string();
        j.clear().unwrap();
        assert!(
            j.query(&LogQuery {
                cursor: Some(cursor),
                ..LogQuery::default()
            })
            .is_err()
        );
        j.append("error", "test", "new", Value::Null).unwrap();
        assert_eq!(
            j.query(&LogQuery::default()).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn byte_budget_is_bounded() {
        let d = tempfile::tempdir().unwrap();
        let mut j = Journal::open(&d.path().join("l.db")).unwrap();
        j.budget = 4096;
        for _ in 0..1000 {
            j.append("info", "test", &"x".repeat(100), Value::Null)
                .unwrap()
        }
        assert!(j.bytes <= 4096);
    }
    #[test]
    fn full_retention_budget_filters_and_streams_without_loading_history() {
        let d = tempfile::tempdir().unwrap();
        let mut j = Journal::open(&d.path().join("logs.db")).unwrap();
        let entries: Vec<_> = (0..512)
            .map(|index| LogWrite {
                level: if index % 2 == 0 { "warn" } else { "info" }.into(),
                source: "retention".into(),
                message: "x".repeat(49152),
                data: json!({"sequence":index}),
            })
            .collect();
        for batch in entries.chunks(64) {
            j.append_batch(batch).unwrap();
        }
        assert!(j.bytes <= BUDGET);
        let query = LogQuery {
            source: "retention".into(),
            level: "warn".into(),
            keyword: "sequence".into(),
            ..LogQuery::default()
        };
        let result = j.query(&query).unwrap();
        assert!(result["total"].as_u64().unwrap() > 0);
        assert!(result["entries"].as_array().unwrap().len() <= 200);
        let expected = result["total"].as_u64().unwrap();
        assert_eq!(j.export(&query, std::io::sink(), "json").unwrap(), expected);
        let bad = vec![
            LogWrite {
                level: "info".into(),
                source: "test".into(),
                message: "should roll back".into(),
                data: Value::Null,
            },
            LogWrite {
                level: "info".into(),
                source: "test".into(),
                message: "x".repeat(65537),
                data: Value::Null,
            },
        ];
        assert!(j.append_batch(&bad).is_err());
        assert_eq!(
            j.query(&LogQuery {
                keyword: "should roll back".into(),
                ..LogQuery::default()
            })
            .unwrap()["total"],
            0
        );
    }
}
