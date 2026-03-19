# airouter

`airouter` is a lightweight Anthropic-compatible routing gateway with a built-in web dashboard.
It accepts requests on `/v1/messages`, rewrites models based on your routing rules, forwards traffic to upstream providers, and exposes live monitoring and request history in the browser.

## Features

- Anthropic-compatible `/v1/messages` proxy endpoint
- Model-based routing across multiple upstream providers
- Configurable fallback default model
- Built-in web UI for live traffic monitoring, route inspection, history, and analytics
- Request logging with per-request detail records
- Optional client API key authentication
- Optional OTP-based authentication for the web dashboard
- Embedded frontend assets in the Rust binary
