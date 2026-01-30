const { Octokit } = require('@octokit/rest');
const logger = require('./logger');

class GitHubSyncPlugin {
  constructor(config) {
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'cozeli-github-sync/1.0.0'
    });
    this.owner = config.owner || process.env.GITHUB_REPO_OWNER;
    this.repo = config.repo || process.env.GITHUB_REPO_NAME;
  }

  // 同步 Issues 到 Coze
  async syncIssuesToCoze(options = {}) {
    try {
      const issues = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: options.state || 'open',
        per_page: options.limit || 100
      });

      const formattedIssues = issues.data.map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map(label => label.name),
        assignees: issue.assignees.map(assignee => assignee.login),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        url: issue.html_url
      }));

      logger.info(`同步了 ${formattedIssues.length} 个 Issues`);
      return formattedIssues;
    } catch (error) {
      logger.error('同步 Issues 失败:', error);
      throw error;
    }
  }

  // 从 Coze 数据创建 GitHub Issue
  async createIssueFromCoze(cozeData) {
    try {
      const response = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: cozeData.title,
        body: cozeData.description || '',
        labels: cozeData.tags || [],
        assignees: cozeData.assignees || []
      });

      logger.info(`创建 Issue 成功: #${response.data.number}`);
      return response.data;
    } catch (error) {
      logger.error('创建 Issue 失败:', error);
      throw error;
    }
  }

  // 同步文件内容
  async syncFileContent(path, branch = 'main') {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch
      });

      // 如果是 Base64 编码的内容
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');

      return {
        content,
        sha: response.data.sha,
        path: response.data.path,
        size: response.data.size
      };
    } catch (error) {
      logger.error(`获取文件内容失败 (${path}):`, error);
      throw error;
    }
  }

  // 更新文件
  async updateFile(path, content, message, branch = 'main') {
    try {
      // 先获取文件的 SHA
      const fileInfo = await this.syncFileContent(path, branch).catch(() => ({ sha: null }));

      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: message || `更新文件 ${path}`,
        content: Buffer.from(content).toString('base64'),
        sha: fileInfo.sha,
        branch
      });

      logger.info(`文件更新成功: ${path}`);
      return response.data;
    } catch (error) {
      logger.error(`更新文件失败 (${path}):`, error);
      throw error;
    }
  }
}

module.exports = GitHubSyncPlugin;