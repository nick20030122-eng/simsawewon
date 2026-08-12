"""회의실 예약 현황 대시보드 — 예약 CSV와 체크인 로그를 대조해 노쇼·실사용률을 집계한다."""

import io
import re

import pandas as pd
import streamlit as st

NO_SHOW_GRACE_MINUTES = 15
REQUIRED_BOOKING_COLUMNS = ["예약일시", "종료일시", "회의실", "사번"]
REQUIRED_CHECKIN_COLUMNS = ["체크인일시", "회의실", "사번"]


def normalize_employee_id(value) -> str:
    """그룹웨어(E-00123)와 출입 게이트(123)의 사번 표기 차이를 흡수한다."""
    digits = re.sub(r"\D", "", str(value))
    return digits.lstrip("0") or "0"


def missing_columns(frame: pd.DataFrame, required: list[str]) -> list[str]:
    return [column for column in required if column not in frame.columns]


def load_csv(uploaded) -> pd.DataFrame:
    raw = uploaded.getvalue()
    for encoding in ("utf-8-sig", "cp949"):
        try:
            return pd.read_csv(io.BytesIO(raw), encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949로 저장해 주세요.")


def judge_no_show(bookings: pd.DataFrame, checkins: pd.DataFrame) -> pd.DataFrame:
    """예약 시작 후 유예 시간 내 체크인이 없으면 노쇼로 분류한다."""
    bookings = bookings.copy()
    bookings["_사번"] = bookings["사번"].map(normalize_employee_id)
    bookings["예약일시"] = pd.to_datetime(bookings["예약일시"], errors="coerce")
    bookings["종료일시"] = pd.to_datetime(bookings["종료일시"], errors="coerce")
    bookings = bookings.dropna(subset=["예약일시", "종료일시"])

    checkins = checkins.copy()
    checkins["_사번"] = checkins["사번"].map(normalize_employee_id)
    checkins["체크인일시"] = pd.to_datetime(checkins["체크인일시"], errors="coerce")
    checkins = checkins.dropna(subset=["체크인일시"])

    grace = pd.Timedelta(minutes=NO_SHOW_GRACE_MINUTES)
    used_flags = []
    for row in bookings.itertuples(index=False):
        same_slot = checkins[
            (checkins["_사번"] == getattr(row, "_사번"))
            & (checkins["회의실"] == row.회의실)
            & (checkins["체크인일시"] >= row.예약일시)
            & (checkins["체크인일시"] <= row.예약일시 + grace)
        ]
        used_flags.append(not same_slot.empty)

    bookings["사용여부"] = used_flags
    bookings["예약시간"] = (
        bookings["종료일시"] - bookings["예약일시"]
    ).dt.total_seconds() / 3600
    bookings["실사용시간"] = bookings["예약시간"].where(bookings["사용여부"], 0.0)
    return bookings


def summarize(bookings: pd.DataFrame) -> pd.DataFrame:
    grouped = bookings.groupby("회의실").agg(
        예약건수=("회의실", "size"),
        노쇼건수=("사용여부", lambda s: int((~s).sum())),
        예약시간=("예약시간", "sum"),
        실사용시간=("실사용시간", "sum"),
    )
    grouped["실사용률(%)"] = (
        grouped["실사용시간"] / grouped["예약시간"].replace(0, pd.NA) * 100
    ).round(1)
    grouped["노쇼율(%)"] = (
        grouped["노쇼건수"] / grouped["예약건수"] * 100
    ).round(1)
    return grouped.reset_index()


def weekday_summary(bookings: pd.DataFrame) -> pd.DataFrame:
    names = ["월", "화", "수", "목", "금", "토", "일"]
    frame = bookings.copy()
    frame["요일"] = frame["예약일시"].dt.dayofweek.map(lambda i: names[i])
    grouped = frame.groupby("요일").agg(
        예약건수=("요일", "size"), 실사용시간=("실사용시간", "sum")
    )
    order = [name for name in names if name in grouped.index]
    return grouped.loc[order]


def main() -> None:
    st.set_page_config(page_title="회의실 예약 현황 대시보드", layout="wide")
    st.title("회의실 예약 현황 대시보드")
    st.caption(
        f"예약 내역과 출입 체크인 로그를 대조해 노쇼(시작 후 {NO_SHOW_GRACE_MINUTES}분 내 "
        "체크인 없음)와 실사용률을 집계합니다."
    )

    left, right = st.columns(2)
    booking_file = left.file_uploader("예약 내역 CSV", type="csv")
    checkin_file = right.file_uploader("체크인 로그 CSV (선택)", type="csv")

    if booking_file is None:
        st.info("예약 내역 CSV를 올리면 집계가 시작됩니다.")
        return

    try:
        bookings = load_csv(booking_file)
    except ValueError as error:
        st.error(str(error))
        return

    if bookings.empty:
        st.warning("예약 내역이 비어 있습니다. 헤더만 있는 파일인지 확인해 주세요.")
        return

    lacking = missing_columns(bookings, REQUIRED_BOOKING_COLUMNS)
    if lacking:
        st.error(f"예약 내역에 다음 컬럼이 없습니다: {', '.join(lacking)}")
        return

    if checkin_file is None:
        st.warning("체크인 로그가 없어 노쇼 판정은 건너뛰고 예약 집계만 수행합니다.")
        checkins = pd.DataFrame(columns=REQUIRED_CHECKIN_COLUMNS)
    else:
        try:
            checkins = load_csv(checkin_file)
        except ValueError as error:
            st.error(str(error))
            return
        lacking = missing_columns(checkins, REQUIRED_CHECKIN_COLUMNS)
        if lacking:
            st.error(f"체크인 로그에 다음 컬럼이 없습니다: {', '.join(lacking)}")
            return

    judged = judge_no_show(bookings, checkins)
    if judged.empty:
        st.warning("날짜 형식을 읽을 수 있는 예약 행이 없습니다.")
        return

    room_summary = summarize(judged)

    total = len(judged)
    no_show = int((~judged["사용여부"]).sum())
    metric1, metric2, metric3 = st.columns(3)
    metric1.metric("예약 건수", f"{total}건")
    metric2.metric("노쇼 건수", f"{no_show}건")
    metric3.metric("전체 노쇼율", f"{no_show / total * 100:.1f}%")

    st.subheader("회의실별 실사용률")
    st.dataframe(room_summary, width="stretch")
    st.bar_chart(room_summary.set_index("회의실")["실사용률(%)"])

    st.subheader("요일별 예약·실사용")
    st.bar_chart(weekday_summary(judged))

    st.download_button(
        "집계 결과 CSV 내려받기",
        room_summary.to_csv(index=False).encode("utf-8-sig"),
        file_name="회의실_실사용률.csv",
        mime="text/csv",
    )


if __name__ == "__main__":
    main()
