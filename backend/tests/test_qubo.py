import itertools

import numpy as np
import pytest

from app.services.classical_solver import brute_force
from app.services.qubo import all_bitstrings, build_qubo, from_bitstring, scale, to_quadratic_program
from tests.conftest import random_instance


def direct_objective(x, mu, sigma, risk, k, P):
    """The formula from the docstring, written out literally."""
    m, S = scale(mu, sigma)
    return (1 - risk) / k**2 * x @ S @ x - risk / k * m @ x + P * (x.sum() - k) ** 2


def test_qubo_matrix_matches_formula(instance):
    mu, sigma = instance
    q = build_qubo(mu, sigma, risk=0.4, k=2)
    for x in all_bitstrings(4):
        assert q.cost(x) == pytest.approx(direct_objective(x, mu, sigma, 0.4, 2, q.penalty))


def test_parts_sum_to_cost(instance):
    mu, sigma = instance
    q = build_qubo(mu, sigma, risk=0.6, k=2)
    x = np.array([1, 0, 1, 1])
    assert sum(q.objective_parts(x).values()) == pytest.approx(q.cost(x))


def test_bitstring_order_is_left_to_right():
    X = all_bitstrings(3)
    assert X.shape == (8, 3)
    assert list(X[1]) == [0, 0, 1] and list(X[4]) == [1, 0, 0]
    assert list(from_bitstring("101")) == [1, 0, 1]


@pytest.mark.parametrize("n,k,seed,risk", [
    (n, k, seed, risk)
    for n in (3, 4, 5) for k in range(1, n) for seed in range(5) for risk in (0.0, 0.5, 1.0)
])
def test_penalty_makes_optimum_hold_exactly_k(n, k, seed, risk):
    mu, sigma = random_instance(n, seed)
    q = build_qubo(mu, sigma, risk=risk, k=k)
    assert from_bitstring(brute_force(q).bitstring).sum() == k


def test_extreme_risk_settings_pick_expected_stocks():
    mu = np.array([0.05, 0.40, 0.10, 0.30])
    vols = np.array([0.10, 0.50, 0.15, 0.45])
    sigma = np.diag(vols**2)  # uncorrelated, so the answer is obvious
    growth = brute_force(build_qubo(mu, sigma, risk=1.0, k=2)).bitstring
    safe = brute_force(build_qubo(mu, sigma, risk=0.0, k=2)).bitstring
    assert growth == "0101"  # two highest returns
    assert safe == "1010"    # two lowest variances


def test_brute_force_is_truly_minimal(instance):
    mu, sigma = instance
    q = build_qubo(mu, sigma, risk=0.5, k=2)
    bf = brute_force(q)
    best = min(q.cost(np.array(x)) for x in itertools.product([0, 1], repeat=4))
    assert bf.cost == pytest.approx(best)
    assert len(bf.all_costs) == 16


def test_quadratic_program_matches_qubo(instance):
    mu, sigma = instance
    q = build_qubo(mu, sigma, risk=0.3, k=2)
    qp = to_quadratic_program(q)
    for x in all_bitstrings(4):
        assert qp.objective.evaluate(x) == pytest.approx(q.cost(x))


def test_invalid_inputs(instance):
    mu, sigma = instance
    with pytest.raises(ValueError):
        build_qubo(mu, sigma, risk=1.5, k=2)
    with pytest.raises(ValueError):
        build_qubo(mu, sigma, risk=0.5, k=4)