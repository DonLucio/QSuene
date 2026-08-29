import time

from download_jobs import claim_next, complete_batch, enqueue, fail_batch, list_wishlist, recover_interrupted
from download_service import run_downloads


def process_next_batch():
    """Process one durable batch and queue any full batch accumulated meanwhile."""
    batch = claim_next()
    if not batch:
        return False
    try:
        completed_count, completed_requests = run_downloads(
            batch["payload"]["items"],
            batch["payload"]["use_party_directory"],
            batch["payload"].get("target_directory", ""),
        )
        complete_batch(batch["id"], completed_count, completed_requests)
        # Requests received while this batch ran remain in SQLite. Reaching
        # five creates the next batch without relying on React or a UI action.
        pending = [item for item in list_wishlist() if item["status"] in ("pending", "error")]
        if len(pending) >= 5:
            use_party = any(item.get("preferredParty") for item in pending)
            target_directory = next(
                (item.get("targetDirectory", "") for item in pending if item.get("targetDirectory")),
                "",
            )
            enqueue(
                pending,
                "mixed" if len({bool(item.get("preferredParty")) for item in pending}) > 1 else ("party" if use_party else "library"),
                use_party,
                target_directory,
            )
    except Exception as error:
        fail_batch(batch["id"], str(error)[:300])
    return True


def run_forever():
    while True:
        if not process_next_batch():
            time.sleep(1)


if __name__ == "__main__":
    recover_interrupted()
    run_forever()
