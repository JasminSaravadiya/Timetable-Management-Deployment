from sqlalchemy import Column, Integer, String, Float, ForeignKey, Time, Boolean, JSON
from sqlalchemy.orm import relationship
from database import Base

class TimetableConfig(Base):
    __tablename__ = "timetable_configs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    slot_duration_minutes = Column(Integer, nullable=False)
    breaks = Column(JSON, default=list) # List of {"start_time": "HH:MM", "duration_minutes": int}
    allocations = relationship("Allocation", back_populates="config")

class Branch(Base):
    __tablename__ = "branches"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    name = Column(String, index=True)
    semesters = relationship("Semester", back_populates="branch")

class Semester(Base):
    __tablename__ = "semesters"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), index=True)
    name = Column(String)
    branch = relationship("Branch", back_populates="semesters")
    subjects = relationship("Subject", back_populates="semester")

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    name = Column(String, index=True)
    weekly_hours = Column(Float, default=0.0)
    semester = relationship("Semester", back_populates="subjects")

class Faculty(Base):
    __tablename__ = "faculties"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    name = Column(String, index=True)
    weekly_workload_minutes = Column(Integer, default=2400)
    ignore_collision = Column(Boolean, default=False)

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    name = Column(String, index=True)
    capacity = Column(Integer, default=0)

class SemesterFacultyMap(Base):
    __tablename__ = "semester_faculty_maps"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), index=True)

class SemesterRoomMap(Base):
    __tablename__ = "semester_room_maps"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), nullable=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), index=True)

class Allocation(Base):
    __tablename__ = "allocations"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("timetable_configs.id"), index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), index=True)
    day_of_week = Column(String, index=True) # e.g., 'Monday'
    start_time = Column(Time, index=True)
    duration_minutes = Column(Integer)
    batches = Column(JSON, default=list) # e.g., ['Batch A', 'Batch B'] for splitting

    config = relationship("TimetableConfig", back_populates="allocations")
