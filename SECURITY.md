# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/Johnny-xuan/Anymark/security/advisories/new) for suspected security issues. Do not publish vulnerabilities, credentials, private bookmark URLs, or personal notes in a public issue.

Include the affected version, a minimal reproduction with synthetic data, the expected behavior, and the security impact. Remove secrets and personal data from logs and screenshots. If a credential was exposed, revoke or rotate it at its provider before sharing a report; deleting a file or rewriting Git history does not invalidate a credential or remove other copies.

## Supported versions

| Version | Security maintenance |
| --- | --- |
| Latest 2.x release | Supported |
| 1.x and earlier | Legacy; upgrade to 2.x |

## Security boundaries

- Chrome owns bookmark titles, URLs, hierarchy, and ordering. Notes are stored locally in the Chrome profile and do not sync through Chrome bookmarks.
- Popup and Web work without local agent authorization. CLI and MCP require explicit local access and a selected profile.
- The native connector trusts the current OS user. Filesystem permissions do not isolate it from malicious programs already running as that same user.
- Bookmark titles, URLs, notes, imported HTML, and copied agent prompts must be treated as data, not trusted instructions.
- Deletion is permanent. Backups may contain private URLs and notes and are not encrypted. Keep them outside the repository.
- AnyMark does not require AI credentials or operate a cloud bookmark database. External agents have their own security and privacy policies.

---

# 安全政策

## 私下报告安全问题

发现疑似安全问题时，请使用 [GitHub 私密漏洞报告](https://github.com/Johnny-xuan/Anymark/security/advisories/new)。不要在公开 Issue 中发布漏洞利用细节、凭证、私人书签网址或备注。

请提供受影响版本、使用虚构数据的最小复现、预期行为及安全影响。提交日志或截图前，移除密钥和个人数据。凭证一旦暴露，应先在服务商处撤销或轮换；删除文件、改写 Git 历史不能使凭证失效，也无法删除他人已经保存的副本。

## 支持范围

当前最新 2.x 版本接受安全修复。1.x 及更早版本属于旧版，请升级到 2.x。

## 安全边界

- Chrome 保存书签结构；备注保存在当前 Profile 本地，不通过 Chrome 书签同步。
- Popup 和 Web 不需要开启本机 Agent 授权；CLI／MCP 需要明确授权并选择 Profile。
- 本地连接器的信任边界是当前操作系统用户，不能隔离已经以同一用户身份运行的恶意程序。
- 书签内容、导入文件和复制给 Agent 的指令应作为数据处理，不能视为可信系统指令。
- 删除不可撤销。HTML 备份未加密，可能包含私人网址与备注，请保存在仓库之外。
- AnyMark 不需要 AI API Key，也没有云端书签数据库。外部 Agent 的安全与隐私规则由其自身决定。
