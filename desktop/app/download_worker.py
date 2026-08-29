import os
import time

from download_jobs import claim_next, complete_batch, fail_batch, recover_interrupted
from server import _run_spotdl_downloads


def run_forever():
    while True:
        batch = claim_next()
        if not batch:
            time.sleep(1)
            continue
        try:
            completed_count, completed_requests = _run_spotdl_downloads(
                batch["payload"]["items"],
                batch["payload"]["use_party_directory"],
            )
            complete_batch(batch["id"], completed_count, completed_requests)
        except Exception as error:
            fail_batch(batch["id"], str(error)[:300])


if __name__ == "__main__":
    recover_interrupted()
    run_forever()
