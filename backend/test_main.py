from datetime import time
from main import check_overlap, add_minutes

def test_add_minutes():
    t1 = time(8, 0)
    t2 = add_minutes(t1, 60)
    assert t2 == time(9, 0)

def test_add_minutes_cross_hour():
    t1 = time(8, 45)
    t2 = add_minutes(t1, 30)
    assert t2 == time(9, 15)

def test_check_overlap_true():
    # 08:00 - 09:00 vs 08:30 - 09:30 => Overlaps!
    s1, e1 = time(8, 0), time(9, 0)
    s2, e2 = time(8, 30), time(9, 30)
    assert check_overlap(s1, e1, s2, e2) is True

def test_check_overlap_false_sequential():
    # 08:00 - 09:00 vs 09:00 - 10:00 => No overlap (ends exactly when starts)
    s1, e1 = time(8, 0), time(9, 0)
    s2, e2 = time(9, 0), time(10, 0)
    assert check_overlap(s1, e1, s2, e2) is False

def test_check_overlap_false_gap():
    # 08:00 - 09:00 vs 10:00 - 11:00 => No overlap
    s1, e1 = time(8, 0), time(9, 0)
    s2, e2 = time(10, 0), time(11, 0)
    assert check_overlap(s1, e1, s2, e2) is False
    
def test_check_overlap_inner():
    # 08:00 - 10:00 vs 08:30 - 09:00 => Overlaps!
    s1, e1 = time(8, 0), time(10, 0)
    s2, e2 = time(8, 30), time(9, 0)
    assert check_overlap(s1, e1, s2, e2) is True
