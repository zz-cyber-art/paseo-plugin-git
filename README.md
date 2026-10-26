# paseo-plugin-git

Paseo 工作区 **Git 面板**插件：在 Paseo 里直接做暂存、逐块（hunk）暂存、提交、冲突解决等日常 git 操作，不用切回终端。

## 功能

- **状态总览**：当前分支、领先/落后上游（↑n↓m）、最近一次提交
- **整文件暂存/撤销**：`Stage` / `Unstage`，支持一键 `Stage all` / `Unstage all`
- **逐块暂存（hunk staging）**：点开文件按 hunk 拆分显示，可只暂存/撤销某一块（`git apply --cached [--reverse]`）
- **提交**：写提交信息，或点 **Generate commit message** 让 agent 根据 staged diff 自动生成 conventional commit 信息
- **冲突解决**：自动检测冲突文件，支持 `Ours` / `Theirs` / `Mark as resolved`，并排对比 ours/theirs（有 base 时也显示）
- **进行中操作提示 + 中止**：检测 merge / rebase / cherry-pick / revert / bisect 进行中，一键 abort
- **撤销改动**：`Discard` 丢弃未暂存修改（未跟踪文件直接删除）

## 安装

### 从 Git 仓库安装

```bash
paseo plugin install git:zz-cyber-art/paseo-plugin-git
```

### 从本地目录安装

```bash
git clone git@github.com:zz-cyber-art/paseo-plugin-git.git
cd paseo-plugin-git
npm install
npm run typecheck
paseo plugin install "$(pwd)"
```

## 使用

安装后打开任意 **git 工作区**，在 Agents / Terminal / Files 旁边会出现 **Git** 标签页。

- **暂存**：Changes 区点文件右侧 `Stage`，或展开文件后对单个 hunk 点 `Stage hunk`
- **撤销暂存**：Staged 区点 `Unstage`，或展开后对单个 hunk 点 `Unstage hunk`
- **提交**：底部 Commit 区输入信息（或点 `Generate commit message` 自动生成），点 `Commit`
- **冲突**：Conflicts 区点 `Ours` / `Theirs` 直接解决，或手动编辑文件后点 `Mark`
- **中止操作**：顶部黄色横幅点 `Abort`

### 自动生成提交信息

默认用 `claude/claude-sonnet-5-5` 起一个一次性 agent 生成信息，可在面板里改成任意 `provider/model`（例如 `claude/claude-opus-4-6`）。该功能需要一个可用的 agent provider。

## 要求

- Paseo ≥ 0.10.3（daemon 与客户端）
- daemon 的 `PATH` 里可用 `git`

## 安全说明

Paseo 插件是**受信任的非沙箱代码**：服务端代码在 daemon 主机上运行，可访问文件、进程、凭据与网络。请只安装你信任的来源。

## 许可

Apache-2.0
