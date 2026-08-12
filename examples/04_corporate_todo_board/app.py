"""팀 업무 관리 보드 — 세션 메모리에 할 일을 저장하는 간단한 목록 앱."""

import streamlit as st

st.set_page_config(page_title="팀 업무 관리 보드")
st.title("팀 업무 관리 보드")

if "todos" not in st.session_state:
    st.session_state.todos = []

with st.form("add"):
    title = st.text_input("할 일")
    owner = st.text_input("담당자")
    submitted = st.form_submit_button("추가")
    if submitted and title:
        st.session_state.todos.append({"title": title, "owner": owner, "done": False})

st.subheader("할 일 목록")
for index, todo in enumerate(st.session_state.todos):
    checked = st.checkbox(
        f"{todo['title']} ({todo['owner']})", value=todo["done"], key=f"todo-{index}"
    )
    st.session_state.todos[index]["done"] = checked

if st.session_state.todos:
    done = sum(1 for todo in st.session_state.todos if todo["done"])
    st.write(f"완료 {done} / 전체 {len(st.session_state.todos)}")
