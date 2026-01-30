require('dotenv').config();
const axios = require('axios');
const { Octokit } = require('@octokit/rest');

async function syncIssues() {
  console.log('开始同步 Issues...');

  // 初始化 GitHub
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  // 获取 Issues
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner: process.env.GITHUB_REPO_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    state: 'all',
    per_page: 100
  });

  console.log(`找到 ${issues.length} 个 Issues`);

  // 同步到 Coze
  for (const issue of issues.slice(0, 10)) { // 限制数量，避免超限
    try {
      await axios.post(
        'https://api.coze.com/v1/data/sync',
        {
          source: 'github',
          type: 'issue',
          data: {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            labels: issue.labels,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            url: issue.html_url
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.COCZE_API_KEY}`
          }
        }
      );

      console.log(`✅ 同步 Issue #${issue.number}: ${issue.title}`);
    } catch (error) {
      console.error(`❌ 同步 Issue #${issue.number} 失败:`, error.message);
    }
  }

  console.log('同步完成！');
}

syncIssues().catch(console.error);