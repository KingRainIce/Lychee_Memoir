"""Bootstrap admin + demo data (aligned with frontend mockData)."""

import logging

from sqlmodel import Session, select

logger = logging.getLogger(__name__)

from app.config import get_settings
from app.db import engine
from app.models import AlumniPost, CampusEvent, PostStatus, User
from app.security import hash_password
from app.services.rag_index import index_alumni_post, index_campus_event


def _seed_events(session: Session, campus_id: str) -> None:
    demos: list[dict] = [
        {
            "year": 1995,
            "month": 6,
            "lng": 113.9312,
            "lat": 22.5368,
            "nx": 0.62,
            "ny": 0.38,
            "title": "科技楼奠基",
            "summary": "主教学实验组团动工，校园天际线开始成形。",
            "body": "九十年代中期，学校重点投入教学与实验设施建设。科技楼（示意文案）奠基标志着粤海校区从基础教学向科研并重过渡。",
            "image_url": "https://picsum.photos/seed/szu1/400/240",
            "address": "深圳大学粤海校区 · 理工片区",
        },
        {
            "year": 2008,
            "month": 9,
            "lng": 113.934,
            "lat": 22.5392,
            "nx": 0.48,
            "ny": 0.52,
            "title": "校庆嘉年华",
            "summary": "社团巡礼与露天演出，操场周边人流如织。",
            "body": "校庆日前后，元平体育场与周边广场举办社团展示、音乐节与校友返校活动。",
            "image_url": "https://picsum.photos/seed/szu2/400/240",
            "address": "深圳大学粤海校区 · 体育场周边",
        },
        {
            "year": 2018,
            "month": 12,
            "lng": 113.9288,
            "lat": 22.5384,
            "nx": 0.35,
            "ny": 0.44,
            "title": "图书馆夜读",
            "summary": "考试周延长开放，灯火通明的自习故事。",
            "body": "期末季图书馆延长闭馆时间，走廊与台阶也坐满背书的同学。",
            "image_url": "https://picsum.photos/seed/szu3/400/240",
            "address": "深圳大学粤海校区 · 图书馆",
        },
        {
            "year": 2024,
            "month": 6,
            "lng": 113.9365,
            "lat": 22.5365,
            "nx": 0.72,
            "ny": 0.58,
            "title": "毕业季打卡",
            "summary": "标志性校门与湖畔合影，告别与启程重叠。",
            "body": "六月离校季，毕业生在湖畔与校门拍摄纪念照。校友会发起「带地标回家」线上相册征集。",
            "image_url": "https://picsum.photos/seed/szu4/400/240",
            "address": "深圳大学粤海校区 · 校门广场",
        },
    ]
    for d in demos:
        ev = CampusEvent(campus_id=campus_id, **d)
        session.add(ev)
    session.commit()
    for ev in session.exec(select(CampusEvent).where(CampusEvent.campus_id == campus_id)).all():
        try:
            index_campus_event(session, ev)
        except Exception as e:
            logger.warning("index_campus_event skipped for %s: %s", ev.id, e)


def _seed_posts(session: Session, campus_id: str, author: User) -> None:
    rows = [
        {
            "year": 2026,
            "month": 3,
            "lng": 113.9325,
            "lat": 22.5372,
            "nx": 0.55,
            "ny": 0.42,
            "body": "从北门进来走了半圈，文山湖边的风还是很软。当年在这背书考雅思，现在带孩子认植物。希望「深大记忆」能把这些零碎坐标留下来。",
            "excerpt": "十年后回来看了一眼文山湖，水位线好像变了。",
            "image_url": "https://picsum.photos/seed/post1/320/200",
            "address": "文山湖步道",
        },
        {
            "year": 2026,
            "month": 3,
            "lng": 113.9352,
            "lat": 22.5405,
            "nx": 0.5,
            "ny": 0.62,
            "body": "节奏大概是 5 分配，跑完在桂庙附近喝凉茶。地图要是能标「校友常跑线」会很有趣——先占个坑。",
            "excerpt": "夜跑路线推荐：体育场两圈 + 桂庙路口凉茶。",
            "image_url": "https://picsum.photos/seed/post2/320/200",
            "address": "元平体育场",
        },
    ]
    for d in rows:
        p = AlumniPost(author_id=author.id, campus_id=campus_id, status=PostStatus.approved, **d)
        session.add(p)
    session.commit()
    for p in session.exec(select(AlumniPost).where(AlumniPost.campus_id == campus_id)).all():
        try:
            index_alumni_post(session, p)
        except Exception as e:
            logger.warning("index_alumni_post skipped for %s: %s", p.id, e)


def ensure_seed() -> None:
    settings = get_settings()
    campuses_seed = ("yuehai", "lihu")
    with Session(engine) as session:
        admin = session.exec(select(User).where(User.email == settings.INIT_ADMIN_EMAIL)).first()
        if not admin:
            admin = User(
                email=settings.INIT_ADMIN_EMAIL,
                hashed_password=hash_password(settings.INIT_ADMIN_PASSWORD),
                display_name="管理员",
                is_admin=True,
            )
            session.add(admin)
            session.commit()
            session.refresh(admin)

        for cid in campuses_seed:
            n_events = session.exec(select(CampusEvent).where(CampusEvent.campus_id == cid)).first()
            if not n_events:
                _seed_events(session, cid)

        n_posts = session.exec(select(AlumniPost).where(AlumniPost.campus_id == "yuehai")).first()
        if not n_posts:
            _seed_posts(session, "yuehai", admin)
