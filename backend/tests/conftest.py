import numpy as np
import pytest


def random_instance(n: int, seed: int):
    """A realistic-looking (mu, Sigma): annual returns ~N(0.15, 0.2), vols 15-60%."""
    rng = np.random.default_rng(seed)
    mu = rng.normal(0.15, 0.2, n)
    vols = rng.uniform(0.15, 0.6, n)
    A = rng.normal(size=(n, n))
    corr = A @ A.T
    d = np.sqrt(np.diag(corr))
    corr = corr / np.outer(d, d)
    return mu, corr * np.outer(vols, vols)


@pytest.fixture
def instance():
    return random_instance(4, seed=7)
