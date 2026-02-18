"""
工具函数
"""
import shutil
from datetime import datetime
from pathlib import Path
from PIL import Image

# 数据目录
DATA_DIR = Path(__file__).parent.parent / "data"
ORDER_IMAGES_DIR = DATA_DIR / "order_images"
FABRIC_IMAGES_DIR = DATA_DIR / "fabric_images"
GARMENT_IMAGES_DIR = DATA_DIR / "garment_images"
PATTERN_IMAGES_DIR = DATA_DIR / "pattern_images"




# 确保目录存在
for dir_path in [ORDER_IMAGES_DIR, FABRIC_IMAGES_DIR, GARMENT_IMAGES_DIR, PATTERN_IMAGES_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)


def save_uploaded_file(uploaded_file, subdir="order_images"):
    """
    保存上传的文件
    
    Args:
        uploaded_file: Streamlit的UploadedFile对象
        subdir: 子目录名
    
    Returns:
        str: 保存后的文件路径
    """
    target_dir = DATA_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # 生成唯一文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{uploaded_file.name}"
    filepath = target_dir / filename
    
    # 保存文件
    with open(filepath, "wb") as f:
        f.write(uploaded_file.getbuffer())
    
    return str(filepath)


def compress_image(image_path, max_size=(800, 800), quality=85):
    """
    压缩图片以节省空间
    
    Args:
        image_path: 原图路径
        max_size: 最大尺寸
        quality: JPEG质量
    
    Returns:
        str: 压缩后的图片路径
    """
    img = Image.open(image_path)
    
    # 转换为RGB（处理RGBA）
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
    
    # 等比缩放
    img.thumbnail(max_size, Image.Resampling.LANCZOS)
    
    # 生成压缩后的文件名
    filepath = Path(image_path)
    compressed_path = filepath.parent / f"{filepath.stem}_compressed.jpg"
    
    # 保存
    img.save(compressed_path, "JPEG", quality=quality, optimize=True)
    
    return str(compressed_path)


def format_price(price):
    """格式化价格显示"""
    if price is None:
        return "-"
    return f"¥{price:.2f}"


def format_length(length):
    """格式化长度显示"""
    if length is None:
        return "-"
    value = round(float(length), 3)
    text = f"{value:.3f}".rstrip('0').rstrip('.')
    return f"{text}米"


def format_width(width):
    """格式化幅宽显示"""
    if width is None:
        return "-"
    return f"{width}cm"


def format_date(date_str):
    """格式化日期显示"""
    if not date_str:
        return "-"
    try:
        date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return date.strftime("%Y-%m-%d")
    except:
        return date_str


def get_image_display_path(image_path):
    """获取用于显示的图片路径"""
    if not image_path:
        return None
    
    path = Path(image_path)
    if path.exists():
        return str(path)
    
    # 尝试找压缩版本
    compressed = path.parent / f"{path.stem}_compressed.jpg"
    if compressed.exists():
        return str(compressed)
    
    return None
