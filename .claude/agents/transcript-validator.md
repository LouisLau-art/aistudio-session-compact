# transcript-validator Subagent

## 目标
验证 AI Studio 导出的会话数据的完整性和质量。

## 职责
- **检查分块丢失**：分析 `session.raw.ndjson` 中的 `order` 字段，确认是否连续。
- **验证 DOM 水化**：检查是否存在虚拟滚动导致的部分 turn 内容为空（或仅包含 UI 占位符）。
- **校验尾部时间戳**：通过对比最后一条消息的内容与原始网页内容，确认导出未被截断。
- **图像质量检测**：验证 OCR 提取的结果是否与描述一致。

## 常用工具
- `grep`, `jq` 处理 ndjson
- 比较 `transcript.txt` 和网页原始数据的差异
