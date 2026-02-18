"""
OCR识别模块
使用PaddleOCR识别订单截图中的信息
"""
import re
from pathlib import Path
from PIL import Image
import tempfile

# 延迟导入PaddleOCR（避免启动时加载太慢）
_ocr = None

def get_ocr():
    """获取OCR引擎实例（单例模式）"""
    global _ocr
    if _ocr is None:
        try:
            from paddleocr import PaddleOCR
            # 使用轻量级中文模型
            _ocr = PaddleOCR(
                use_angle_cls=True,  # 方向分类
                lang='ch',           # 中文
                show_log=False,      # 不显示日志
                use_gpu=False        # CPU运行
            )
            print("✅ OCR引擎初始化成功")
        except Exception as e:
            print(f"❌ OCR初始化失败: {e}")
            raise
    return _ocr


def recognize_image(image_path):
    """
    识别图片中的文字
    
    Args:
        image_path: 图片路径或PIL Image对象
    
    Returns:
        dict: 包含识别结果和信息提取
    """
    try:
        ocr = get_ocr()
        
        # 如果是PIL Image，先保存临时文件
        if isinstance(image_path, Image.Image):
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                image_path.save(tmp.name)
                image_path = tmp.name
        
        # 执行OCR
        result = ocr.ocr(str(image_path), cls=True)
        
        # 提取所有文字
        all_text = []
        if result and result[0]:
            for line in result[0]:
                if line:
                    text = line[1][0]  # 文字内容
                    confidence = line[1][1]  # 置信度
                    all_text.append({
                        "text": text,
                        "confidence": confidence
                    })
        
        # 合并所有文字用于分析
        full_text = "\n".join([item["text"] for item in all_text])
        
        # 提取结构化信息
        extracted = extract_info(full_text)
        
        return {
            "success": True,
            "raw_text": full_text,
            "details": all_text,
            "extracted": extracted
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "raw_text": "",
            "details": [],
            "extracted": {}
        }


def extract_info(text):
    """
    从文本中提取关键信息
    
    提取字段：
    - 商品名称/布料名称
    - 长度（米）
    - 宽度/幅宽（cm）
    - 价格（元）
    - 店铺名
    """
    info = {
        "name": None,
        "length": None,
        "width": None,
        "price": None,
        "shop": None
    }
    
    lines = text.split('\n')
    
    # 提取价格（多种格式）
    price_patterns = [
        r'[￥¥]\s*(\d+\.?\d*)',           # ¥100, ￥50.5
        r'价格[:：]?\s*(\d+\.?\d*)',       # 价格: 100
        r'合计[:：]?\s*(\d+\.?\d*)',       # 合计: 100
        r'(\d+\.?\d*)\s*元',              # 100元
    ]
    for pattern in price_patterns:
        match = re.search(pattern, text)
        if match:
            info["price"] = float(match.group(1))
            break
    
    # 提取长度（米）
    length_patterns = [
        r'(\d+\.?\d*)\s*米',               # 2.5米, 3米
        r'(\d+\.?\d*)\s*m',                # 2.5m
        r'长度[:：]?\s*(\d+\.?\d*)',        # 长度: 2.5
    ]
    for pattern in length_patterns:
        match = re.search(pattern, text)
        if match:
            info["length"] = float(match.group(1))
            break
    
    # 提取幅宽/宽度（cm）
    width_patterns = [
        r'(\d+)\s*cm',                     # 140cm
        r'(\d+)\s*CM',                     # 140CM
        r'幅宽[:：]?\s*(\d+)',              # 幅宽: 140
        r'宽度[:：]?\s*(\d+)',              # 宽度: 140
    ]
    for pattern in width_patterns:
        match = re.search(pattern, text)
        if match:
            info["width"] = int(match.group(1))
            break
    
    # 提取店铺名（常见电商平台格式）
    shop_patterns = [
        r'店铺[:：]?\s*([^\n]+)',           # 店铺: XXX
        r'卖家[:：]?\s*([^\n]+)',           # 卖家: XXX
        r'商家[:：]?\s*([^\n]+)',           # 商家: XXX
    ]
    for pattern in shop_patterns:
        match = re.search(pattern, text)
        if match:
            info["shop"] = match.group(1).strip()
            break
    
    # 如果没找到店铺名，尝试找"旗舰店"、"专营店"等
    if not info["shop"]:
        shop_match = re.search(r'([^\n]{2,20}(?:旗舰店|专营店|专卖店|店))', text)
        if shop_match:
            info["shop"] = shop_match.group(1).strip()
    
    # 提取商品名称（通常是比较长的文字行）
    # 排除纯数字、价格、短文本
    candidate_names = []
    for line in lines:
        line = line.strip()
        # 过滤条件
        if len(line) < 5 or len(line) > 50:  # 太短或太长
            continue
        if re.match(r'^[\d\.]+$', line):  # 纯数字
            continue
        if re.match(r'^[￥¥]', line):  # 价格行
            continue
        if '店铺' in line or '价格' in line or '合计' in line:  # 元数据行
            continue
        candidate_names.append(line)
    
    if candidate_names:
        # 选最长的一条作为商品名（通常商品名比较长）
        info["name"] = max(candidate_names, key=len)
    
    return info


def test_ocr(image_path):
    """测试OCR识别效果"""
    print(f"🔍 测试图片: {image_path}")
    result = recognize_image(image_path)
    
    if result["success"]:
        print("\n📄 识别到的文字:")
        print(result["raw_text"])
        print("\n📊 提取的信息:")
        for key, value in result["extracted"].items():
            print(f"  {key}: {value}")
    else:
        print(f"❌ 识别失败: {result['error']}")
    
    return result


if __name__ == "__main__":
    # 测试用
    import sys
    if len(sys.argv) > 1:
        test_ocr(sys.argv[1])
    else:
        print("用法: python ocr_engine.py <图片路径>")
