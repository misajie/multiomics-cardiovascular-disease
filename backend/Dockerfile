# backend/Dockerfile
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码和数据
COPY app.py .

# 暴露端口
EXPOSE 5000

# 运行 Flask 应用
CMD ["python", "app.py"]