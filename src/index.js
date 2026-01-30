require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const winston = require('winston');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置日志
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// 中间件
app.use(bodyParser.json({ verify: verifyWebhook }));
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// 验证 GitHub Webhook 签名
function verifyWebhook(req, res, buf, encoding) {
  const signature = req.headers['x-hub-signature'];
  if (!signature) {
    return;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const hmac = crypto.createHmac('sha1', secret);
  const digest = 'sha1=' + hmac.update(buf).digest('hex');

  if (signature !== digest) {
    throw new Error('Invalid signature');
  }
}

// 健康检查端点
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cozeli-github-sync',
    version: '1.0.0',
    github_repo: `https://github.com/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
  });
});

// GitHub Webhook 处理
app.post('/webhook/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    logger.info(`收到 GitHub 事件: ${event}`);

    // 根据事件类型处理
    switch (event) {
      case 'push':
        await handlePushEvent(payload);
        break;
      case 'issues':
        await handleIssuesEvent(payload);
        break;
      case 'pull_request':
        await handlePullRequestEvent(payload);
        break;
      default:
        logger.info(`未处理的事件类型: ${event}`);
    }

    res.status(200).json({ success: true, event });
  } catch (error) {
    logger.error('Webhook 处理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 处理 push 事件
async function handlePushEvent(payload) {
  const { repository, commits, ref } = payload;
  logger.info(`代码推送: ${ref} - ${commits.length} 个提交`);

  // 触发 Coze 工作流
  await triggerCozeWorkflow('github_push', {
    repo: repository.full_name,
    branch: ref.replace('refs/heads/', ''),
    commits: commits.map(c => ({
      id: c.id,
      message: c.message,
      author: c.author.name
    })),
    timestamp: new Date().toISOString()
  });
}

// 触发 Coze 工作流
async function triggerCozeWorkflow(eventType, data) {
  try {
    const response = await axios.post(
      'https://api.coze.com/v1/workflow/trigger',
      {
        bot_id: process.env.COCZE_BOT_ID,
        event_type: eventType,
        data: data
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.COCZE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`Coze 工作流触发成功: ${response.data.workflow_id}`);
    return response.data;
  } catch (error) {
    logger.error('Coze 工作流触发失败:', error.response?.data || error.message);
    throw error;
  }
}

// Coze 回调端点
app.post('/webhook/coze', async (req, res) => {
  try {
    const { event, data, signature } = req.body;

    // 验证签名（如果Coze提供）
    if (signature) {
      const isValid = verifyCozeSignature(signature, data);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    logger.info(`收到 Coze 事件: ${event}`);

    // 处理 Coze 事件
    switch (event) {
      case 'workflow_completed':
        await handleWorkflowCompleted(data);
        break;
      case 'new_message':
        await handleCozeMessage(data);
        break;
      default:
        logger.info(`未处理的 Coze 事件: ${event}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Coze webhook 错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`🚀 服务器启动在端口 ${PORT}`);
  logger.info(`📝 GitHub 仓库: ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`);
  logger.info(`🌐 本地地址: http://localhost:${PORT}`);
});