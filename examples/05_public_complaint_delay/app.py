"""민원 처리 지연 현황 대시보드 — 접수 대장 CSV를 법정 처리기한과 대조해 지연 건을 찾는다."""

import io
from datetime import date

import pandas as pd
import streamlit as st

# 민원 유형별 법정 처리기한(역일). 기한 개정 시 이 표만 수정한다.
STATUTORY_DEADLINES = {
    "즉시민원": 3,
    "증명서발급": 3,
    "인허가": 10,
    "건축신고": 10,
    "도로보수": 7,
    "환경오염신고": 7,
    "복지상담": 14,
    "일반민원": 14,
}
DEFAULT_DEADLINE_DAYS = 14
IMMINENT_THRESHOLD_DAYS = 2

REQUIRED_COLUMNS = ["접수일", "민원유형", "처리부서"]
# 집계에 불필요한 개인정보 컬럼 — 화면·내려받기에서 제외한다
PERSONAL_COLUMNS = ["민원인성명", "성명", "연락처", "전화번호", "주소", "이메일"]


def load_csv(uploaded) -> pd.DataFrame:
    raw = uploaded.getvalue()
    for encoding in ("utf-8-sig", "cp949"):
        try:
            return pd.read_csv(io.BytesIO(raw), encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949로 저장해 주세요.")


def drop_personal_columns(frame: pd.DataFrame) -> pd.DataFrame:
    targets = [c for c in frame.columns if c in PERSONAL_COLUMNS]
    return frame.drop(columns=targets)


def deadline_for(complaint_type: str) -> int:
    return STATUTORY_DEADLINES.get(str(complaint_type).strip(), DEFAULT_DEADLINE_DAYS)


def analyze(frame: pd.DataFrame, base_day: date) -> tuple[pd.DataFrame, int, list[str]]:
    """처리일수·잔여일을 계산하고 초과/임박/정상으로 분류한다."""
    work = frame.copy()
    work["접수일"] = pd.to_datetime(work["접수일"], errors="coerce")

    if "처리완료일" in work.columns:
        work["처리완료일"] = pd.to_datetime(work["처리완료일"], errors="coerce")
    else:
        work["처리완료일"] = pd.NaT

    before = len(work)
    work = work.dropna(subset=["접수일"])
    dropped = before - len(work)

    base = pd.Timestamp(base_day)
    # 미처리 건은 기준일까지 경과한 것으로 본다
    end_day = work["처리완료일"].fillna(base)
    work["처리일수"] = (end_day - work["접수일"]).dt.days.clip(lower=0)
    work["처리상태"] = work["처리완료일"].notna().map({True: "완료", False: "처리중"})

    work["법정기한"] = work["민원유형"].map(deadline_for)
    work["잔여일"] = work["법정기한"] - work["처리일수"]

    def classify(remaining: int) -> str:
        if remaining < 0:
            return "기한초과"
        if remaining <= IMMINENT_THRESHOLD_DAYS:
            return "지연임박"
        return "정상"

    work["기한판정"] = work["잔여일"].map(classify)

    known = set(STATUTORY_DEADLINES)
    unknown = sorted({str(t).strip() for t in work["민원유형"]} - known)
    return work, dropped, unknown


def by_department(work: pd.DataFrame) -> pd.DataFrame:
    grouped = work.groupby("처리부서").agg(
        처리건수=("처리부서", "size"),
        평균처리일수=("처리일수", "mean"),
        초과건수=("기한판정", lambda s: int((s == "기한초과").sum())),
    )
    grouped["평균처리일수"] = grouped["평균처리일수"].round(1)
    grouped["초과율(%)"] = (grouped["초과건수"] / grouped["처리건수"] * 100).round(1)
    return grouped.reset_index().sort_values("초과율(%)", ascending=False)


def delayed_rows(work: pd.DataFrame) -> pd.DataFrame:
    flagged = work[work["기한판정"] != "정상"].copy()
    columns = [
        c
        for c in ["접수일", "민원유형", "처리부서", "처리상태", "처리일수", "법정기한", "잔여일", "기한판정"]
        if c in flagged.columns
    ]
    return flagged[columns].sort_values("잔여일")


def main() -> None:
    st.set_page_config(page_title="민원 처리 지연 현황 대시보드", layout="wide")
    st.title("민원 처리 지연 현황 대시보드")
    st.caption(
        "민원 접수 대장을 올리면 유형별 법정 처리기한과 대조해 기한 초과·지연 임박 건을 "
        "찾아냅니다. 민원인 개인정보 컬럼은 집계에서 제외합니다."
    )

    base_day = st.sidebar.date_input("기준일 (미처리 건 경과일 계산)", value=date.today())
    st.sidebar.markdown("**법정 처리기한**")
    st.sidebar.dataframe(
        pd.DataFrame(
            {"민원유형": list(STATUTORY_DEADLINES), "기한(일)": list(STATUTORY_DEADLINES.values())}
        ),
        hide_index=True,
        width="stretch",
    )

    uploaded = st.file_uploader("민원 접수 대장 CSV", type="csv")
    if uploaded is None:
        st.info("민원 접수 대장 CSV를 올리면 집계가 시작됩니다.")
        return

    try:
        raw = load_csv(uploaded)
    except ValueError as error:
        st.error(str(error))
        return

    if raw.empty:
        st.warning("접수 대장이 비어 있습니다. 헤더만 있는 파일인지 확인해 주세요.")
        return

    frame = drop_personal_columns(raw)
    missing = [c for c in REQUIRED_COLUMNS if c not in frame.columns]
    if missing:
        st.error(f"접수 대장에 다음 컬럼이 없습니다: {', '.join(missing)}")
        return

    work, dropped, unknown = analyze(frame, base_day)
    if work.empty:
        st.warning("접수일을 읽을 수 있는 행이 없습니다. 날짜 형식을 확인해 주세요.")
        return

    if dropped:
        st.warning(f"접수일 형식을 인식하지 못한 {dropped}건은 집계에서 제외했습니다.")
    if unknown:
        st.info(
            f"법정기한 표에 없는 민원 유형 {len(unknown)}종은 일반민원 기준"
            f"({DEFAULT_DEADLINE_DAYS}일)을 적용했습니다: {', '.join(unknown[:5])}"
        )

    total = len(work)
    over = int((work["기한판정"] == "기한초과").sum())
    soon = int((work["기한판정"] == "지연임박").sum())

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("전체 민원", f"{total}건")
    col2.metric("기한 초과", f"{over}건")
    col3.metric("지연 임박", f"{soon}건")
    col4.metric("초과율", f"{over / total * 100:.1f}%")

    dept = by_department(work)
    st.subheader("부서별 처리 현황")
    st.dataframe(dept, hide_index=True, width="stretch")
    st.bar_chart(dept.set_index("처리부서")["초과율(%)"])

    st.subheader("지연 건 목록 (잔여일 오름차순)")
    delayed = delayed_rows(work)
    if delayed.empty:
        st.success("기한 초과·지연 임박 건이 없습니다.")
    else:
        st.dataframe(delayed, hide_index=True, width="stretch")

    left, right = st.columns(2)
    left.download_button(
        "부서별 집계 CSV",
        dept.to_csv(index=False).encode("utf-8-sig"),
        file_name="부서별_민원처리현황.csv",
        mime="text/csv",
    )
    right.download_button(
        "지연 건 목록 CSV",
        delayed.to_csv(index=False).encode("utf-8-sig"),
        file_name="민원_지연건목록.csv",
        mime="text/csv",
        disabled=delayed.empty,
    )


if __name__ == "__main__":
    main()
