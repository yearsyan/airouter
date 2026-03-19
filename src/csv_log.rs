use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

use serde_json::Value;
use tracing::error;

const CSV_FILE: &str = "requests.csv";
const HEADER: &str = "time,request_id,key_name,input_model,output_model,ttft_ms,tps,input_tokens,output_tokens,user_agent";

pub struct RequestLog {
    pub time: String,
    pub request_id: String,
    pub key_name: String,
    pub input_model: String,
    pub output_model: String,
    pub ttft_ms: u64,
    pub tps: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub user_agent: String,
}

pub fn append_log(log_dir: &Path, log: &RequestLog) {
    let path = log_dir.join(CSV_FILE);
    let needs_header = !path.exists() || path.metadata().map(|m| m.len() == 0).unwrap_or(true);

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            if let Err(err) = std::fs::create_dir_all(parent) {
                error!(?err, "failed to create log directory");
                return;
            }
        }
    }

    let mut file = match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(f) => f,
        Err(err) => {
            error!(?err, path = %path.display(), "failed to open CSV log file");
            return;
        }
    };

    if needs_header {
        let _ = writeln!(file, "{HEADER}");
    }

    let _ = writeln!(
        file,
        "{},{},{},{},{},{},{:.2},{},{},{}",
        escape_csv(&log.time),
        escape_csv(&log.request_id),
        escape_csv(&log.key_name),
        escape_csv(&log.input_model),
        escape_csv(&log.output_model),
        log.ttft_ms,
        log.tps,
        log.input_tokens,
        log.output_tokens,
        escape_csv(&log.user_agent),
    );
}

pub fn write_detail_log(log_dir: &Path, request_id: &str, data: &Value) {
    if !is_safe_filename(request_id) {
        error!("invalid request_id for detail log: {request_id}");
        return;
    }

    if !log_dir.exists() {
        if let Err(err) = std::fs::create_dir_all(log_dir) {
            error!(?err, "failed to create log directory");
            return;
        }
    }

    let path = log_dir.join(format!("{request_id}.log.txt"));
    match serde_json::to_string_pretty(data) {
        Ok(content) => {
            if let Err(err) = std::fs::write(&path, content) {
                error!(?err, path = %path.display(), "failed to write detail log");
            }
        }
        Err(err) => {
            error!(?err, "failed to serialize detail log");
        }
    }
}

pub fn read_detail_log(log_dir: &Path, request_id: &str) -> Option<Value> {
    if !is_safe_filename(request_id) {
        return None;
    }
    let path = log_dir.join(format!("{request_id}.log.txt"));
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn read_csv_entries(log_dir: &Path) -> Vec<Value> {
    let path = log_dir.join(CSV_FILE);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut lines = content.lines();
    let headers = match lines.next() {
        Some(h) => parse_csv_fields(h),
        None => return Vec::new(),
    };

    let mut entries = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let fields = parse_csv_fields(line);
        let mut entry = serde_json::Map::new();
        for (i, header) in headers.iter().enumerate() {
            if let Some(value) = fields.get(i) {
                entry.insert(header.clone(), Value::String(value.clone()));
            }
        }
        entries.push(Value::Object(entry));
    }

    entries.reverse();
    entries
}

fn parse_csv_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => {
                    fields.push(std::mem::take(&mut current));
                }
                _ => current.push(c),
            }
        }
    }
    fields.push(current);
    fields
}

fn is_safe_filename(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 50
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
