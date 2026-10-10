from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    allowed_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()