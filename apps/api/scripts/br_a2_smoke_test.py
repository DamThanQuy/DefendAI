"""Quick smoke test BR-A2: list students + scoring summary with test data."""
import asyncio
from decimal import Decimal as D
from app.core.database import async_session_maker
from app.models.meeting import MeetingMember, MemberRole
from app.models.defense_score import DefenseScore


async def seed_scores():
    async with async_session_maker() as db:
        # 2 SV (member_id 1,2) — chấm cho SV 1 (TDA implementation 8) + SV 2 (TDA impl 6)
        # BR-A2: 2 SV cùng nhóm, OGA giống nhau (per nhóm), TDA khác nhau
        # OGA: 7.0 all items (per nhóm, student_id=NULL)
        # SV1 TDA: implementation=8, presentation=7 → avg=(8*35+7*5)/40=7.875
        # SV2 TDA: implementation=6 → 6.0 (chỉ 1 item → weighted avg=6.0)
        oga_items = {"introduction": 7.0, "pmp": 7.0, "srs": 7.0, "sdd": 7.0,
                     "testing": 7.0, "user_guides": 7.0, "implementation": 7.0}
        rows = [
            # OGA per nhóm (student_id NULL)
            *[DefenseScore(meeting_id=1, student_id=None, reviewer_id=None,
                          reviewer_name="Admin", is_ai=False,
                          group="OGA", item_code=k, mark=D(str(v)), comment=None)
              for k, v in oga_items.items()],
            # SV1 TDA
            DefenseScore(meeting_id=1, student_id=1, reviewer_id=None,
                         reviewer_name="Admin", is_ai=False,
                         group="TDA", item_code="implementation",
                         mark=D("8.0"), comment="tot"),
            DefenseScore(meeting_id=1, student_id=1, reviewer_id=None,
                         reviewer_name="Admin", is_ai=False,
                         group="TDA", item_code="presentation",
                         mark=D("7.0"), comment=None),
            # SV2 TDA
            DefenseScore(meeting_id=1, student_id=2, reviewer_id=None,
                         reviewer_name="Admin", is_ai=False,
                         group="TDA", item_code="implementation",
                         mark=D("6.0"), comment="can cai thien"),
        ]
        for r in rows:
            db.add(r)
        await db.commit()
        print("seeded", len(rows), "scores")


async def check_summary():
    from app.services.scoring_service import aggregate_student, final_score
    from app.services.rubric_service import get_rubric_by_key

    async with async_session_maker() as db:
        rubric = await get_rubric_by_key(db, "defense_sep490")
        config = dict(rubric.config)

        rows = (
            await db.execute(
                __import__("sqlalchemy").select(DefenseScore).where(DefenseScore.meeting_id == 1)
            )
        ).scalars().all()

        # BR-A2: OGA per nhóm (student_id=NULL), TDA per sinh viên (student_id != NULL)
        # Lọc đúng như scoring.py summary endpoint
        team_oga: dict[str, list[float]] = {}
        per_student: dict[int, dict] = {}
        for r in rows:
            grp = r.group  # SQLAlchemy hybrid property → actual string
            if r.student_id is None and grp == "OGA":
                team_oga.setdefault(r.item_code, []).append(float(r.mark))
            else:
                sid = r.student_id
                bucket = per_student.setdefault(sid, {"OGA": {}, "TDA": {}})
                bucket[grp].setdefault(r.item_code, []).append(float(r.mark))

        def _means(d):
            return {k: sum(v) / len(v) for k, v in d.items()}

        # Team OGA score
        if team_oga:
            team = final_score(_means(team_oga), {}, config)
            print(f"  team OGA: score={team['oga']['score']} (expected 7.0)")

        # Per-student TDA + final
        for sid in sorted(per_student):
            bucket = per_student[sid]
            res = final_score(_means(bucket["OGA"]), _means(bucket["TDA"]), config)
            print(f"  student_id={sid}: oga={res['oga']['score']} tda={res['tda']['score']} final={res['final']} verdict={res['verdict']}")

async def main():
    await seed_scores()
    await check_summary()


if __name__ == "__main__":
    asyncio.run(main())
