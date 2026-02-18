"""
数据库操作模块
管理布料和成衣的数据存储
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path

DATABASE_PATH = Path(__file__).parent.parent / "data" / "fabric_archive.db"


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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE CASCADE
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


def add_garment(fabric_id, name=None, image_path=None, made_date=None, notes=None):
    """添加成衣记录"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO garments (fabric_id, name, image_path, made_date, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (fabric_id, name, image_path, made_date, notes))
    
    garment_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return garment_id


def delete_garment(garment_id):
    """删除成衣记录"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM garments WHERE id = ?", (garment_id,))
    conn.commit()
    conn.close()
    return True


def get_all_shops():
    """获取所有店铺列表（用于筛选）"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT DISTINCT shop FROM fabrics WHERE shop IS NOT NULL ORDER BY shop")
    shops = [row[0] for row in cursor.fetchall()]
    conn.close()
    return shops


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
    
    conn.close()
    
    return {
        "export_time": datetime.now().isoformat(),
        "fabrics": fabrics,
        "garments": garments
    }


def import_from_json(data):
    """从JSON导入数据"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # 清空现有数据
        cursor.execute("DELETE FROM garments")
        cursor.execute("DELETE FROM fabrics")
        
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
                INSERT INTO garments (id, fabric_id, name, image_path, made_date, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                garment.get("id"),
                garment.get("fabric_id"),
                garment.get("name"),
                garment.get("image_path"),
                garment.get("made_date"),
                garment.get("notes"),
                garment.get("created_at")
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
