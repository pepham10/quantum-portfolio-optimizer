from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    warmup: bool = True  # run one background optimization at startup so the first click is fast

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()