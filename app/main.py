"""
布料档案管家 - 主程序
Fabric Archive Manager
要把工作目录 cd 在: \fabric-archive-main
"""
import streamlit as st
import sys
from pathlib import Path

# 添加app目录到路径
sys.path.append(str(Path(__file__).parent))

from database import (
    init_database,
    add_fabric, get_all_fabrics, get_fabric_by_id,
    update_fabric, delete_fabric,
    add_garment, delete_garment,
    get_all_shops,

    add_pattern, get_all_patterns, get_pattern_by_id, update_pattern, delete_pattern,
    add_size_profile, get_all_size_profiles, get_size_profile_by_id, update_size_profile, delete_size_profile,

    export_to_json, import_from_json
)

from ocr_engine import recognize_image
from utils import save_uploaded_file, compress_image, format_price, format_length, format_width, format_date, get_image_display_path
import json
from datetime import datetime

# 页面配置
st.set_page_config(
    page_title="布料档案管家",
    page_icon="🧵",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 初始化数据库
init_database()

# 自定义CSS样式
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #FF6B9D;
        text-align: center;
        margin-bottom: 2rem;
    }
    .fabric-card {
        background-color: #f8f9fa;
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1rem;
    }
    .stat-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 10px;
        padding: 1.5rem;
        text-align: center;
    }
    .stButton>button {
        border-radius: 20px;
        padding: 0.5rem 2rem;
    }
</style>
""", unsafe_allow_html=True)


def show_home():
    """首页 - 布料列表"""
    st.markdown('<div class="main-header">🧵 布料档案管家</div>', unsafe_allow_html=True)
    
    # 统计卡片
    fabrics = get_all_fabrics()
    total_fabrics = len(fabrics)
    total_value = sum(f.get('price', 0) or 0 for f in fabrics)
    total_length = sum(f.get('length', 0) or 0 for f in fabrics)
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("📦 布料总数", f"{total_fabrics}块")
    with col2:
        st.metric("💰 总价值", f"¥{total_value:.0f}")
    with col3:
        st.metric("📏 总长度", f"{total_length:.1f}米")
    with col4:
        shops = len(set(f.get('shop') for f in fabrics if f.get('shop')))
        st.metric("🏪 店铺数量", f"{shops}家")
    
    st.divider()
    
    # 搜索、筛选与快捷添加
    col_search, col_shop, col_view, col_add = st.columns([3, 2, 1, 2])
    
    with col_search:
        search = st.text_input("🔍 搜索布料", placeholder="输入名称或店铺...")
    
    with col_shop:
        shops = ["全部"] + get_all_shops()
        selected_shop = st.selectbox("🏪 筛选店铺", shops)
    
    with col_view:
        view_mode = st.selectbox("📊 视图", ["网格", "列表"])

    with col_add:
        st.write("")
        if st.button("➕ 去添加布料", use_container_width=True):
            st.session_state.page = "add"
            st.rerun()
    
    # 获取筛选后的布料
    shop_filter = None if selected_shop == "全部" else selected_shop
    fabrics = get_all_fabrics(search=search or None, shop=shop_filter)
    
    st.write(f"找到 **{len(fabrics)}** 块布料")
    
    # 显示布料
    if view_mode == "网格":
        cols = st.columns(3)
        for idx, fabric in enumerate(fabrics):
            with cols[idx % 3]:
                with st.container():
                    st.markdown('<div class="fabric-card">', unsafe_allow_html=True)
                    
                    # 图片
                    img_path = get_image_display_path(fabric.get('fabric_image_path') or fabric.get('order_image_path'))
                    if img_path:
                        st.image(img_path, use_container_width=True)
                    else:
                        st.image("https://via.placeholder.com/300x200?text=无图片", use_container_width=True)
                    
                    # 信息
                    st.subheader(fabric['name'][:20] + "..." if len(fabric['name']) > 20 else fabric['name'])
                    st.write(f"🏪 {fabric.get('shop', '未知店铺')}")
                    st.write(f"📏 {format_length(fabric.get('length'))} | {format_width(fabric.get('width'))}")
                    st.write(f"💰 {format_price(fabric.get('price'))}")
                    
                    # 按钮
                    if st.button("查看详情", key=f"view_{fabric['id']}"):
                        st.session_state.page = "detail"
                        st.session_state.fabric_id = fabric['id']
                        st.rerun()
                    
                    st.markdown('</div>', unsafe_allow_html=True)
    else:
        # 列表视图
        for fabric in fabrics:
            col1, col2, col3, col4 = st.columns([1, 3, 2, 1])
            
            with col1:
                img_path = get_image_display_path(fabric.get('fabric_image_path') or fabric.get('order_image_path'))
                if img_path:
                    st.image(img_path, width=100)
            
            with col2:
                st.write(f"**{fabric['name']}**")
                st.write(f"🏪 {fabric.get('shop', '未知店铺')}")
            
            with col3:
                st.write(f"📏 {format_length(fabric.get('length'))}")
                st.write(f"📐 {format_width(fabric.get('width'))}")
                st.write(f"💰 {format_price(fabric.get('price'))}")
            
            with col4:
                if st.button("详情", key=f"list_view_{fabric['id']}"):
                    st.session_state.page = "detail"
                    st.session_state.fabric_id = fabric['id']
                    st.rerun()
            
            st.divider()


def show_add_fabric():
    """添加新布料"""
    title_col, action_col = st.columns([5, 1])
    with title_col:
        st.header("➕ 添加新布料")
    with action_col:
        st.write("")
        if st.button("取消并返回", use_container_width=True):
            for key in ["ocr_result", "last_uploaded", "temp_image_path"]:
                st.session_state.pop(key, None)
            st.session_state.page = "home"
            st.rerun()

    st.info("📸 上传淘宝/小红书订单截图，AI自动识别信息")

    uploaded_file = st.file_uploader("上传订单截图", type=['png', 'jpg', 'jpeg'])

    if uploaded_file:
        # 显示预览
        st.image(uploaded_file, caption="订单截图预览", use_container_width=True)

        # 初始化表单数据
        if 'ocr_result' not in st.session_state or st.session_state.get('last_uploaded') != uploaded_file.name:
            with st.spinner("🔍 正在识别订单信息..."):
                # 保存临时文件
                temp_path = save_uploaded_file(uploaded_file, "temp")

                # OCR识别
                result = recognize_image(temp_path)
                st.session_state.ocr_result = result
                st.session_state.last_uploaded = uploaded_file.name
                st.session_state.temp_image_path = temp_path

        result = st.session_state.ocr_result

        if result['success']:
            extracted = result['extracted']

            st.subheader("📝 识别结果（可编辑）")

            # 表单
            with st.form("fabric_form"):
                name = st.text_input("布料名称 *", value=extracted.get('name') or "")

                col1, col2 = st.columns(2)
                with col1:
                    length = st.number_input("长度（米）", value=extracted.get('length') or 0.0, min_value=0.0, step=0.1)
                with col2:
                    width = st.number_input("幅宽（cm）", value=extracted.get('width') or 0, min_value=0, step=5)

                col3, col4 = st.columns(2)
                with col3:
                    shop = st.text_input("店铺名", value=extracted.get('shop') or "")
                with col4:
                    price = st.number_input("价格（元）", value=extracted.get('price') or 0.0, min_value=0.0, step=0.01)

                submitted = st.form_submit_button("💾 保存布料", use_container_width=True)

                if submitted:
                    if not name:
                        st.error("请填写布料名称")
                    else:
                        # 压缩并保存图片
                        temp_path = st.session_state.temp_image_path
                        compressed_path = compress_image(temp_path)

                        # 保存到正式目录
                        import shutil
                        final_path = Path("data/order_images") / Path(compressed_path).name
                        shutil.move(compressed_path, final_path)

                        # 添加到数据库
                        fabric_id = add_fabric(
                            name=name,
                            length=length if length > 0 else None,
                            width=int(width) if width > 0 else None,
                            shop=shop or None,
                            price=price if price > 0 else None,
                            order_image_path=str(final_path)
                        )

                        st.success(f"✅ 布料已保存！ID: {fabric_id}")

                        # 清理session
                        for key in ["ocr_result", "last_uploaded", "temp_image_path"]:
                            st.session_state.pop(key, None)

                        # 返回首页
                        st.session_state.page = "home"
                        st.rerun()
        else:
            st.error(f"❌ 识别失败: {result.get('error', '未知错误')}")
            st.info("提示：你也可以手动填写信息保存")

            # 手动填写表单
            with st.form("manual_fabric_form"):
                name = st.text_input("布料名称 *")
                col1, col2 = st.columns(2)
                with col1:
                    length = st.number_input("长度（米）", min_value=0.0, step=0.1)
                with col2:
                    width = st.number_input("幅宽（cm）", min_value=0, step=5)

                col3, col4 = st.columns(2)
                with col3:
                    shop = st.text_input("店铺名")
                with col4:
                    price = st.number_input("价格（元）", min_value=0.0, step=0.01)

                submitted = st.form_submit_button("💾 保存布料")

                if submitted and name:
                    # 保存图片
                    temp_path = st.session_state.temp_image_path
                    compressed_path = compress_image(temp_path)
                    final_path = Path("data/order_images") / Path(compressed_path).name
                    import shutil
                    shutil.move(compressed_path, final_path)

                    fabric_id = add_fabric(
                        name=name,
                        length=length if length > 0 else None,
                        width=int(width) if width > 0 else None,
                        shop=shop or None,
                        price=price if price > 0 else None,
                        order_image_path=str(final_path)
                    )

                    st.success(f"✅ 布料已保存！ID: {fabric_id}")
                    for key in ["ocr_result", "last_uploaded", "temp_image_path"]:
                        st.session_state.pop(key, None)
                    st.session_state.page = "home"
                    st.rerun()

def show_fabric_detail():
    """布料详情页"""
    fabric_id = st.session_state.get('fabric_id')
    if not fabric_id:
        st.error("未指定布料ID")
        return

    fabric = get_fabric_by_id(fabric_id)
    if not fabric:
        st.error("布料不存在")
        return

    # 返回按钮
    if st.button("← 返回列表"):
        st.session_state.page = "home"
        st.rerun()

    st.header(f"🧵 {fabric['name']}")

    col1, col2 = st.columns([1, 2])

    with col1:
        # 大图
        img_path = get_image_display_path(fabric.get('fabric_image_path') or fabric.get('order_image_path'))
        if img_path:
            st.image(img_path, use_container_width=True)

        # 操作按钮
        st.divider()
        confirm_delete = st.checkbox("确认删除这块布料", key=f"confirm_delete_fabric_{fabric_id}")
        if st.button("🗑️ 删除这块布料", type="secondary", use_container_width=True):
            if confirm_delete:
                deleted = delete_fabric(fabric_id)
                if deleted:
                    st.success("已删除")
                else:
                    st.warning("该布料不存在或已删除")
                st.session_state.page = "home"
                st.session_state.pop("fabric_id", None)
                st.session_state.pop("show_add_garment", None)
                st.rerun()
            else:
                st.error("请先勾选确认删除")

    with col2:
        # 信息卡片
        st.subheader("📋 布料信息")

        info_col1, info_col2 = st.columns(2)
        with info_col1:
            st.write(f"**店铺:** {fabric.get('shop', '-')}")
            st.write(f"**剩余长度:** {format_length(fabric.get('length'))}")
            st.write(f"**幅宽:** {format_width(fabric.get('width'))}")
        with info_col2:
            st.write(f"**价格:** {format_price(fabric.get('price'))}")
            st.write(f"**录入时间:** {format_date(fabric.get('created_at'))}")

        st.divider()
        st.subheader("✏️ 编辑布料信息")
        with st.form("fabric_edit_form"):
            new_name = st.text_input("布料名称 *", value=fabric.get('name') or "")

            edit_col1, edit_col2 = st.columns(2)
            with edit_col1:
                new_length = st.number_input("原长（米）", min_value=0.0, step=0.1, value=float(fabric.get('length') or 0.0))
            with edit_col2:
                new_width = st.number_input("幅宽（cm）", min_value=0, step=5, value=int(fabric.get('width') or 0))

            edit_col3, edit_col4 = st.columns(2)
            with edit_col3:
                new_shop = st.text_input("店铺名", value=fabric.get('shop') or "")
            with edit_col4:
                new_price = st.number_input("价格（元）", min_value=0.0, step=0.01, value=float(fabric.get('price') or 0.0))

            new_fabric_image = st.file_uploader("替换布料图片（可选）", type=['png', 'jpg', 'jpeg'])

            if st.form_submit_button("💾 保存修改", use_container_width=True):
                if not new_name:
                    st.error("布料名称不能为空")
                    return

                image_path = fabric.get('fabric_image_path')
                if new_fabric_image:
                    raw_path = save_uploaded_file(new_fabric_image, "fabric_images")
                    image_path = compress_image(raw_path)

                changed = update_fabric(
                    fabric_id,
                    name=new_name,
                    length=new_length if new_length > 0 else None,
                    width=int(new_width) if new_width > 0 else None,
                    shop=new_shop or None,
                    price=new_price if new_price > 0 else None,
                    fabric_image_path=image_path
                )

                if changed:
                    st.success("✅ 布料信息已更新")
                else:
                    st.warning("未检测到可更新的内容")
                st.rerun()

        st.divider()

        # 成衣作品
        st.subheader("👗 成衣作品")

        garments = fabric.get('garments', [])
        if garments:
            for garment in garments:
                with st.container():
                    col_g1, col_g2 = st.columns([1, 3])
                    with col_g1:
                        g_img = get_image_display_path(garment.get('image_path'))
                        if g_img:
                            st.image(g_img, width=100)
                    with col_g2:
                        st.write(f"**{garment.get('name', '未命名作品')}**")
                        st.write(f"制作日期: {format_date(garment.get('made_date'))}")
                        st.write(f"使用布长: {format_length(garment.get('used_length'))}")
                        if garment.get('notes'):
                            st.write(f"备注: {garment['notes']}")
                        if st.button("删除", key=f"del_g_{garment['id']}"):
                            delete_garment(garment['id'])
                            st.rerun()
                    st.divider()
        else:
            st.info("还没有成衣记录，点击下方按钮添加")

        # 添加成衣按钮
        if st.button("➕ 添加成衣作品"):
            st.session_state.show_add_garment = True

        # 添加成衣表单
        if st.session_state.get('show_add_garment'):
            with st.form("add_garment_form"):
                st.write("**新增成衣**")
                g_name = st.text_input("作品名称")
                g_image = st.file_uploader("成衣照片", type=['png', 'jpg', 'jpeg'])
                g_date = st.date_input("制作日期", datetime.now())
                g_notes = st.text_area("备注")
                g_used_length = st.number_input("使用布长（米）", min_value=0.0, step=0.1)

                col_submit, col_cancel = st.columns(2)
                with col_submit:
                    if st.form_submit_button("💾 保存"):
                        if g_image:
                            remaining_length = fabric.get('length')
                            if g_used_length <= 0:
                                st.error("请输入有效的使用布长（需大于 0）")
                                return
                            if remaining_length is None:
                                st.error("该布料没有可用的剩余长度，无法扣减")
                                return
                            if g_used_length > remaining_length:
                                st.error("使用布长不能超过当前剩余长度")
                                return

                            # 保存图片
                            img_path = save_uploaded_file(g_image, "garment_images")
                            compressed = compress_image(img_path)

                            try:
                                add_garment(
                                    fabric_id=fabric_id,
                                    name=g_name or None,
                                    image_path=compressed,
                                    made_date=g_date.isoformat(),
                                    notes=g_notes or None,
                                    used_length=g_used_length
                                )
                            except ValueError as e:
                                st.error(str(e))
                                return

                            st.success("✅ 成衣记录已添加")
                            st.session_state.show_add_garment = False
                            st.rerun()
                        else:
                            st.error("请上传成衣照片")

                with col_cancel:
                    if st.form_submit_button("取消"):
                        st.session_state.show_add_garment = False
                        st.rerun()

def show_backup():
    """数据备份页面"""
    st.header("💾 数据备份")
    
    st.subheader("📤 导出数据")
    if st.button("导出为JSON"):
        data = export_to_json()
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        st.download_button(
            label="下载备份文件",
            data=json_str,
            file_name=f"fabric_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json"
        )
    
    st.divider()
    
    st.subheader("📥 导入数据")
    uploaded_backup = st.file_uploader("上传备份文件", type=['json'])
    if uploaded_backup:
        try:
            data = json.loads(uploaded_backup.getvalue().decode('utf-8'))
            st.write(f"备份时间: {data.get('export_time', '未知')}")
            st.write(f"布料数量: {len(data.get('fabrics', []))}")
            st.write(f"成衣数量: {len(data.get('garments', []))}")
            st.write(f"纸样数量: {len(data.get('patterns', []))}")
            st.write(f"尺码档案数量: {len(data.get('size_profiles', []))}")

            
            if st.checkbox("确认导入（会覆盖现有数据）"):
                import_from_json(data)
                st.success("✅ 数据导入成功")
        except Exception as e:
            st.error(f"导入失败: {e}")

def show_pattern_list():
    """纸样列表"""
    st.header("📄 纸样列表")

    col_a, col_b, col_c = st.columns([3, 1, 1])
    with col_a:
        search = st.text_input("🔍 搜索纸样", placeholder="输入纸样名称...")
    with col_b:
        view_mode = st.selectbox("📊 视图", ["网格", "列表"])
    with col_c:
        if st.button("➕ 去添加纸样", use_container_width=True):
            st.session_state.page = "pattern_add"
            st.rerun()

    patterns = get_all_patterns(search=search or None)
    st.write(f"找到 **{len(patterns)}** 个纸样")
    st.divider()

    if view_mode == "网格":
        cols = st.columns(3)
        for idx, p in enumerate(patterns):
            with cols[idx % 3]:
                st.markdown('<div class="fabric-card">', unsafe_allow_html=True)

                img_path = get_image_display_path(p.get("image_path"))
                if img_path:
                    st.image(img_path, use_container_width=True)
                else:
                    st.image("https://via.placeholder.com/300x200?text=无图片", use_container_width=True)

                st.subheader(p["name"][:20] + "..." if len(p["name"]) > 20 else p["name"])
                if p.get("notes"):
                    st.write(p["notes"][:60] + "..." if len(p["notes"]) > 60 else p["notes"])
                st.write(f"🕒 {format_date(p.get('created_at'))}")

                if st.button("查看详情", key=f"pat_view_{p['id']}"):
                    st.session_state.page = "pattern_detail"
                    st.session_state.pattern_id = p["id"]
                    st.rerun()

                st.markdown("</div>", unsafe_allow_html=True)
    else:
        for p in patterns:
            col1, col2, col3 = st.columns([1, 4, 1])
            with col1:
                img_path = get_image_display_path(p.get("image_path"))
                if img_path:
                    st.image(img_path, width=100)
            with col2:
                st.write(f"**{p['name']}**")
                if p.get("notes"):
                    st.write(p["notes"])
                st.write(f"🕒 {format_date(p.get('created_at'))}")
            with col3:
                if st.button("详情", key=f"pat_list_view_{p['id']}"):
                    st.session_state.page = "pattern_detail"
                    st.session_state.pattern_id = p["id"]
                    st.rerun()
            st.divider()


def show_pattern_add():
    """添加纸样"""
    st.header("➕ 添加纸样")
    st.info("上传纸样图片，填写名称与备注后保存")

    with st.form("pattern_add_form"):
        name = st.text_input("纸样名称 *")
        img = st.file_uploader("纸样图片", type=["png", "jpg", "jpeg"])
        notes = st.text_area("备注", placeholder="例如：纸样来源、尺码范围、打印说明等")

        col_s, col_b = st.columns(2)
        with col_s:
            submitted = st.form_submit_button("💾 保存纸样", use_container_width=True)
        with col_b:
            back = st.form_submit_button("取消并返回", use_container_width=True)

        if back:
            st.session_state.page = "pattern_list"
            st.rerun()

        if submitted:
            if not name:
                st.error("请填写纸样名称")
                return

            image_path = None
            if img:
                raw_path = save_uploaded_file(img, "pattern_images")
                image_path = compress_image(raw_path)

            pid = add_pattern(name=name, image_path=image_path, notes=notes or None)
            st.success(f"✅ 纸样已保存，ID: {pid}")
            st.session_state.page = "pattern_list"
            st.rerun()


def show_pattern_detail():
    """纸样详情"""
    pattern_id = st.session_state.get("pattern_id")
    if not pattern_id:
        st.error("未指定纸样ID")
        return

    p = get_pattern_by_id(pattern_id)
    if not p:
        st.error("纸样不存在")
        return

    if st.button("← 返回纸样列表"):
        st.session_state.page = "pattern_list"
        st.rerun()

    st.header(f"📄 {p['name']}")

    col1, col2 = st.columns([1, 2])
    with col1:
        img_path = get_image_display_path(p.get("image_path"))
        if img_path:
            st.image(img_path, use_container_width=True)
        else:
            st.image("https://via.placeholder.com/300x200?text=无图片", use_container_width=True)

        st.divider()
        confirm_del = st.checkbox("确认删除该纸样")
        if st.button("🗑️ 删除该纸样", type="secondary", use_container_width=True):
            if confirm_del:
                delete_pattern(pattern_id)
                st.success("已删除")
                st.session_state.page = "pattern_list"
                st.session_state.pop("pattern_id", None)
                st.rerun()
            else:
                st.error("请先勾选确认删除")

    with col2:
        st.subheader("📋 信息")
        st.write(f"录入时间: {format_date(p.get('created_at'))}")

        st.divider()
        st.subheader("✏️ 编辑")
        with st.form("pattern_edit_form"):
            new_name = st.text_input("纸样名称 *", value=p.get("name") or "")
            new_img = st.file_uploader("替换图片（可选）", type=["png", "jpg", "jpeg"])
            new_notes = st.text_area("备注", value=p.get("notes") or "")

            if st.form_submit_button("保存修改", use_container_width=True):
                if not new_name:
                    st.error("纸样名称不能为空")
                    return

                new_image_path = p.get("image_path")
                if new_img:
                    raw_path = save_uploaded_file(new_img, "pattern_images")
                    new_image_path = compress_image(raw_path)

                update_pattern(pattern_id, name=new_name, image_path=new_image_path, notes=new_notes or None)
                st.success("✅ 已保存修改")
                st.rerun()


def show_size_list():
    """尺码档案列表"""
    st.header("📐 尺码档案")

    col_a, col_b = st.columns([3, 1])
    with col_a:
        search = st.text_input("🔍 搜索档案", placeholder="输入档案名称...")
    with col_b:
        if st.button("➕ 新增尺码档案", use_container_width=True):
            st.session_state.page = "size_add"
            st.rerun()

    profiles = get_all_size_profiles(search=search or None)
    st.write(f"找到 **{len(profiles)}** 个尺码档案")
    st.divider()

    if not profiles:
        st.info("还没有尺码档案，点击右侧按钮新增")
        return

    for sp in profiles:
        col1, col2, col3 = st.columns([4, 2, 1])
        with col1:
            st.write(f"**{sp['name']}**")
            h = sp.get("height_cm")
            w = sp.get("weight_kg")
            st.write(f"身高: {h if h is not None else '-'} cm，体重: {w if w is not None else '-'} kg")
            if sp.get("description"):
                st.write(sp["description"])
        with col2:
            st.write(f"🕒 {format_date(sp.get('created_at'))}")
        with col3:
            if st.button("详情", key=f"sp_view_{sp['id']}"):
                st.session_state.page = "size_detail"
                st.session_state.size_profile_id = sp["id"]
                st.rerun()
        st.divider()


def show_size_add():
    """新增尺码档案"""
    st.header("➕ 新增尺码档案")
    st.info("填写基本信息后保存")

    with st.form("size_add_form"):
        name = st.text_input("档案名称 *", placeholder="例如：我自己，家人A")

        col1, col2 = st.columns(2)
        with col1:
            height_cm = st.number_input("身高 cm", min_value=0, step=1)
        with col2:
            weight_kg = st.number_input("体重 kg", min_value=0.0, step=0.1)

        description = st.text_area("描述", placeholder="例如：偏瘦，肩略宽，喜欢宽松版型")

        col_s, col_b = st.columns(2)
        with col_s:
            submitted = st.form_submit_button("💾 保存基本信息", use_container_width=True)
        with col_b:
            back = st.form_submit_button("取消并返回", use_container_width=True)

        if back:
            st.session_state.page = "size_list"
            st.rerun()

        if submitted:
            if not name:
                st.error("请填写档案名称")
                return

            h_val = int(height_cm) if height_cm and height_cm > 0 else None
            w_val = float(weight_kg) if weight_kg and weight_kg > 0 else None

            sid = add_size_profile(name=name, height_cm=h_val, weight_kg=w_val, description=description or None)
            st.success(f"✅ 尺码档案已保存，ID: {sid}")
            st.session_state.page = "size_list"
            st.rerun()


def show_size_detail():
    """尺码档案详情"""
    sid = st.session_state.get("size_profile_id")
    if not sid:
        st.error("未指定尺码档案ID")
        return

    sp = get_size_profile_by_id(sid)
    if not sp:
        st.error("尺码档案不存在")
        return

    if st.button("← 返回尺码档案列表"):
        st.session_state.page = "size_list"
        st.rerun()

    st.header(f"📐 {sp['name']}")

    st.subheader("✏️ 编辑")
    with st.form("size_edit_form"):
        new_name = st.text_input("档案名称 *", value=sp.get("name") or "")

        col1, col2 = st.columns(2)
        with col1:
            new_height = st.number_input("身高 cm", min_value=0, step=1, value=int(sp.get("height_cm") or 0))
        with col2:
            new_weight = st.number_input("体重 kg", min_value=0.0, step=0.1, value=float(sp.get("weight_kg") or 0.0))

        new_desc = st.text_area("描述", value=sp.get("description") or "")

        if st.form_submit_button("保存修改", use_container_width=True):
            if not new_name:
                st.error("档案名称不能为空")
                return

            h_val = int(new_height) if new_height and new_height > 0 else None
            w_val = float(new_weight) if new_weight and new_weight > 0 else None

            update_size_profile(sid, name=new_name, height_cm=h_val, weight_kg=w_val, description=new_desc or None)
            st.success("✅ 已保存修改")
            st.rerun()

    st.divider()
    confirm_del = st.checkbox("确认删除该尺码档案")
    if st.button("🗑️ 删除该尺码档案", type="secondary"):
        if confirm_del:
            delete_size_profile(sid)
            st.success("已删除")
            st.session_state.page = "size_list"
            st.session_state.pop("size_profile_id", None)
            st.rerun()
        else:
            st.error("请先勾选确认删除")

# 侧边栏导航
def sidebar():
    with st.sidebar:
        st.title("🧵 布料档案管家")
        st.divider()
        
        # 导航
        pages = {
            "home": "📦 布料列表",
            "pattern_list": "📄 纸样列表",
            "size_list": "📐 尺码档案",

            "backup": "💾 数据备份"
        }

        
        for page_id, page_name in pages.items():
            if st.button(page_name, use_container_width=True):
                st.session_state.page = page_id
                if page_id != "detail":
                    st.session_state.pop("fabric_id", None)
                if page_id != "pattern_detail":
                    st.session_state.pop("pattern_id", None)
                if page_id != "size_detail":
                    st.session_state.pop("size_profile_id", None)

                st.session_state.pop("show_add_garment", None)

                st.rerun()
        
        st.divider()
        st.caption("📝 使用说明")
        st.info("""
        1. 在布料列表页点击"去添加布料"上传订单截图
        2. AI自动识别信息，可手动修正
        3. 在详情页添加成衣作品
        4. 定期备份数据到GitHub
        """)


# 主程序
def main():
    sidebar()
    
    # 页面路由
    page = st.session_state.get('page', 'home')
    
    if page == 'home':
        show_home()
    elif page == 'add':
        show_add_fabric()
    elif page == 'detail':
        show_fabric_detail()

    elif page == "pattern_list":
        show_pattern_list()
    elif page == "pattern_add":
        show_pattern_add()
    elif page == "pattern_detail":
        show_pattern_detail()

    elif page == "size_list":
        show_size_list()
    elif page == "size_add":
        show_size_add()
    elif page == "size_detail":
        show_size_detail()

    elif page == 'backup':
        show_backup()



if __name__ == "__main__":
    main()
