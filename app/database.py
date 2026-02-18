"""
数据库操作模块
管理布料和成衣的数据存储
"""
import sqlite3
import json
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

DATABASE_PATH = Path(__file__).parent.parent / "data" / "fabric_archive.db"


def _normalize_length(value, precision="0.0001"):
    """归一化长度，避免浮点精度误差。"""
    return Decimal(str(value)).quantize(Decimal(precision), rounding=ROUND_HALF_UP)


def init_database():
    """初始化数据库表结构"""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # 布料表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fabrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            length REAL,
            width INTEGER,
            shop TEXT,
            price REAL,
            fabric_image_path TEXT,
            order_image_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 成衣表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS garments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fabric_id INTEGER NOT NULL,
            name TEXT,
            image_path TEXT NOT NULL,
            made_date DATE,
            notes TEXT,
            used_length REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE CASCADE
        )
    """)

    # 兼容历史数据库：如果缺少 used_length 字段则补充
    cursor.execute("PRAGMA table_info(garments)")
    garment_columns = {row[1] for row in cursor.fetchall()}
    if "used_length" not in garment_columns:
        cursor.execute("ALTER TABLE garments ADD COLUMN used_length REAL")
        # 纸样表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            image_path TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 尺码档案表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS size_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            height_cm REAL,
            weight_kg REAL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")


def add_fabric(name, length=None, width=None, shop=None, price=None, 
               fabric_image_path=None, order_image_path=None):
    """添加新布料"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO fabrics (name, length, width, shop, price, fabric_image_path, order_image_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (name, length, width, shop, price, fabric_image_path, order_image_path))
    
    fabric_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return fabric_id


def get_all_fabrics(search=None, shop=None, min_width=None, max_width=None):
    """获取所有布料，支持筛选"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    query = "SELECT * FROM fabrics WHERE 1=1"
    params = []
    
    if search:
        query += " AND (name LIKE ? OR shop LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    
    if shop:
        query += " AND shop = ?"
        params.append(shop)
    
    if min_width:
        query += " AND width >= ?"
        params.append(min_width)
    
    if max_width:
        query += " AND width <= ?"
        params.append(max_width)
    
    query += " ORDER BY created_at DESC"
    
    cursor.execute(query, params)
    fabrics = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return fabrics


def get_fabric_by_id(fabric_id):
    """获取单个布料详情"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM fabrics WHERE id = ?", (fabric_id,))
    fabric = cursor.fetchone()
    
    if fabric:
        fabric = dict(fabric)
        # 获取关联的成衣
        cursor.execute("SELECT * FROM garments WHERE fabric_id = ? ORDER BY made_date DESC", (fabric_id,))
        fabric['garments'] = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return fabric


def update_fabric(fabric_id, **kwargs):
    """更新布料信息"""
    allowed_fields = ['name', 'length', 'width', 'shop', 'price', 'fabric_image_path']
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    
    if not updates:
        return False
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [fabric_id]
    
    cursor.execute(f"UPDATE fabrics SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    conn.commit()
    conn.close()
    return True


def delete_fabric(fabric_id):
    """删除布料（会级联删除关联的成衣）"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM fabrics WHERE id = ?", (fabric_id,))
    conn.commit()
    conn.close()
    return True


def add_garment(fabric_id, name=None, image_path=None, made_date=None, notes=None, used_length=None):
    """添加成衣记录"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT length FROM fabrics WHERE id = ?", (fabric_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError("布料不存在")

        current_length = row[0]

        if used_length is None:
            used_length = 0

        used_length_dec = _normalize_length(used_length)

        if used_length_dec < 0:
            raise ValueError("使用布长不能为负数")

        if current_length is None:
            raise ValueError("该布料没有可扣减的剩余长度")

        current_length_dec = _normalize_length(current_length)

        if used_length_dec > current_length_dec:
            raise ValueError("使用布长不能超过当前剩余长度")

        new_length_dec = _normalize_length(current_length_dec - used_length_dec)

        cursor.execute(
            "UPDATE fabrics SET length = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (float(new_length_dec), fabric_id)
        )

        cursor.execute("""
            INSERT INTO garments (fabric_id, name, image_path, made_date, notes, used_length)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (fabric_id, name, image_path, made_date, notes, float(used_length_dec)))

        garment_id = cursor.lastrowid
        conn.commit()
        return garment_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_garment(garment_id):
    """删除成衣记录，并归还对应布料的使用布长"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT fabric_id, used_length FROM garments WHERE id = ?", (garment_id,))
        garment = cursor.fetchone()
        if not garment:
            return False

        fabric_id, used_length = garment

        if used_length is not None:
            cursor.execute("SELECT length FROM fabrics WHERE id = ?", (fabric_id,))
            fabric_row = cursor.fetchone()
            if fabric_row and fabric_row[0] is not None:
                restored_length = _normalize_length(fabric_row[0]) + _normalize_length(used_length)
                cursor.execute(
                    "UPDATE fabrics SET length = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (float(_normalize_length(restored_length)), fabric_id)
                )

        cursor.execute("DELETE FROM garments WHERE id = ?", (garment_id,))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_all_shops():
    """获取所有店铺列表（用于筛选）"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT DISTINCT shop FROM fabrics WHERE shop IS NOT NULL ORDER BY shop")
    shops = [row[0] for row in cursor.fetchall()]
    conn.close()
    return shops

# ==================== 纸样 Patterns ====================

def add_pattern(name, image_path=None, notes=None):
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO patterns (name, image_path, notes)
        VALUES (?, ?, ?)
    """, (name, image_path, notes))
    pattern_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return pattern_id


def get_all_patterns(search=None):
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM patterns WHERE 1=1"
    params = []
    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY created_at DESC"

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_pattern_by_id(pattern_id):
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patterns WHERE id = ?", (pattern_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_pattern(pattern_id, **kwargs):
    allowed_fields = ["name", "image_path", "notes"]
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return False

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [pattern_id]
    cursor.execute(
        f"UPDATE patterns SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        values
    )
    conn.commit()
    conn.close()
    return True


def delete_pattern(pattern_id):
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM patterns WHERE id = ?", (pattern_id,))
    conn.commit()
    conn.close()
    return True


# ==================== 尺码档案 Size Profiles ====================

def add_size_profile(name, height_cm=None, weight_kg=None, description=None):
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO size_profiles (name, height_cm, weight_kg, description)
        VALUES (?, ?, ?, ?)
    """, (name, height_cm, weight_kg, description))
    profile_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return profile_id


def get_all_size_profiles(search=None):
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM size_profiles WHERE 1=1"
    params = []
    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY created_at DESC"

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_size_profile_by_id(profile_id):
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM size_profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_size_profile(profile_id, **kwargs):
    allowed_fields = ["name", "height_cm", "weight_kg", "description"]
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return False

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [profile_id]
    cursor.execute(
        f"UPDATE size_profiles SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        values
    )
    conn.commit()
    conn.close()
    return True


def delete_size_profile(profile_id):
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM size_profiles WHERE id = ?", (profile_id,))
    conn.commit()
    conn.close()
    return True

def export_to_json():
    """导出所有数据为JSON"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 导出布料
    cursor.execute("SELECT * FROM fabrics")
    fabrics = [dict(row) for row in cursor.fetchall()]
    
    # 导出成衣
    cursor.execute("SELECT * FROM garments")
    garments = [dict(row) for row in cursor.fetchall()]
    
    # 导出纸样
    cursor.execute("SELECT * FROM patterns")
    patterns = [dict(row) for row in cursor.fetchall()]

    # 导出尺码档案
    cursor.execute("SELECT * FROM size_profiles")
    size_profiles = [dict(row) for row in cursor.fetchall()]

    conn.close()
    
    return {
        "export_time": datetime.now().isoformat(),
        "fabrics": fabrics,
        "garments": garments,
        "patterns": patterns,
        "size_profiles": size_profiles
    }


def import_from_json(data):
    """从JSON导入数据"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # 清空现有数据
        cursor.execute("DELETE FROM garments")
        cursor.execute("DELETE FROM fabrics")
        cursor.execute("DELETE FROM patterns")
        cursor.execute("DELETE FROM size_profiles")

        
        # 导入布料
        for fabric in data.get("fabrics", []):
            cursor.execute("""
                INSERT INTO fabrics (id, name, length, width, shop, price, 
                    fabric_image_path, order_image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fabric.get("id"),
                fabric.get("name"),
                fabric.get("length"),
                fabric.get("width"),
                fabric.get("shop"),
                fabric.get("price"),
                fabric.get("fabric_image_path"),
                fabric.get("order_image_path"),
                fabric.get("created_at"),
                fabric.get("updated_at")
            ))
        
        # 导入成衣
        for garment in data.get("garments", []):
            cursor.execute("""
                INSERT INTO garments (id, fabric_id, name, image_path, made_date, notes, used_length, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                garment.get("id"),
                garment.get("fabric_id"),
                garment.get("name"),
                garment.get("image_path"),
                garment.get("made_date"),
                garment.get("notes"),
                garment.get("used_length"),
                garment.get("created_at")
            ))

        # 导入纸样
        for p in data.get("patterns", []):
            cursor.execute("""
                INSERT INTO patterns (id, name, image_path, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                p.get("id"),
                p.get("name"),
                p.get("image_path"),
                p.get("notes"),
                p.get("created_at"),
                p.get("updated_at")
            ))

        # 导入尺码档案
        for sp in data.get("size_profiles", []):
            cursor.execute("""
                INSERT INTO size_profiles (id, name, height_cm, weight_kg, description, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                sp.get("id"),
                sp.get("name"),
                sp.get("height_cm"),
                sp.get("weight_kg"),
                sp.get("description"),
                sp.get("created_at"),
                sp.get("updated_at")
            ))

        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


# 初始化数据库（首次导入时）
if __name__ == "__main__":
    init_database()
