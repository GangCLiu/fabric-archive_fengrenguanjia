#!/usr/bin/env python3
"""测试 Gemini API 连接"""
import os
import sys

api_key = os.environ.get('GEMINI_API_KEY')
print(f"API Key: {'已设置' if api_key else '未设置'} ({len(api_key) if api_key else 0} chars)")

try:
    from google import genai
    print("✅ google-genai 模块已安装")
    
    client = genai.Client(api_key=api_key)
    print("✅ Gemini 客户端创建成功")
    
    # 简单测试
    print("\n正在测试 API 连接...")
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Hello"
    )
    print(f"✅ API 连接成功！")
    print(f"响应: {response.text[:100]}...")
    
except ImportError as e:
    print(f"❌ 模块未安装: {e}")
    print("请运行: uv add google-genai")
except Exception as e:
    print(f"❌ 错误: {e}")
    print(f"类型: {type(e).__name__}")
