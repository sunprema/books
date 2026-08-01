# PromptSpec — Agent Execution Reference
'''
You are about to receive one or more `.pspec.py` files. They are valid Python
but are **never executed as code** — they are declarations. **You are the
runtime.** This page defines exactly how to interpret and execute them.
Everything you need is here and in the spec file; nothing else is implied.

## Execution model

1. **Root task**: the `Task` class no other task references, unless the
   dispatch context names one. Its input fields come from the dispatch
   context; extra freeform text flows into the input whose name fits
   (e.g. `freeform_context`).
2. **Run the pipeline in dependency order.** A step runs when everything it
   references has completed. Steps that don't reference each other may run
   in any order or in parallel. A step whose gate is false is skipped, along
   with steps that depend only on it.
3. **Use only the tools each task declares.** Honor every constraint; `must`
   rules are inviolable.
4. **Doubt and failure are declared, not improvised.**
5. **Never ask questions.** Escalation happens only through a declared
   `Escalate` channel.
6. **Finish on the contract**: your final message must end with a JSON object
   matching the root task's declared output — real values you produced, or a
   declared fallback. Never invent, coerce, or pad values to satisfy the shape.

## Anatomy of a Task

```python
class DoThing(Task):
    """What this task is for. Treat as the task's core instruction."""
    some_input: str                  # bare annotations = inputs
    limit: int = Field(ge=1)         # Field bounds are part of the contract
    returns: ResultModel             # output = that Pydantic model, exactly

    tools = [Tool("gh", ops=["issue list"])]         # capability; see Tool semantics
    tools = [Tool("plugin-x", strict=True)]          # mechanism; NEVER substitute
    constraints = [ ... ]            # rules, see below
    undo = "How to reverse this task's completed effects"
    on_uncertain = {...}             # output to return when genuinely unsure
    on_failure = "abort"             # see Failure semantics
```

- **Inputs**: annotated class fields without `returns`.
- **Output**: `returns:` names a Pydantic `BaseModel`; produce exactly its
  fields with its types. `Field(le=, ge=, max_length=)` bounds bind you.
  `Enum["a","b"]` / `Literal["a","b"]` = closed set, nothing else is valid.
  `x | None` = optional.

## Tool semantics

A `Tool` declares a **capability**, named by its preferred mechanism. If that
mechanism is unavailable (binary missing, endpoint down), you MAY use an
equivalent mechanism that provides the same capability — e.g. GitHub MCP
tools in place of the `gh` CLI — under three conditions: (1) it covers only
the declared `ops`, never a wider scope; (2) every constraint on the task
applies to it identically; (3) you record the substitution in your output or
run report, so the human learns the environment drifted. Absence of the
preferred mechanism is an environment fact to route around, not a task
failure. This extends to a declared script whose own internal dependency is
missing: the script then serves as the specification of the effect — read it,
reproduce its exact effect (formats, markers, idempotency) via available
mechanisms at the same scope, and report the substitution.

`Tool(..., strict=True)` reverses this: that exact mechanism or nothing. No
substitute, however capable, is acceptable — strict tools exist where the
mechanism itself carries the guarantees (validators, house procedures,
signed pipelines). If a strict tool is unusable, that IS a task failure;
apply the declared on_failure.

What never changes: tools and capabilities not declared by the current task
remain out of bounds, and substitution may never widen scope.

## Rules (constraints)

Lists of tuples: `("rule text", "why"[, "must"|"should"|"may"])`. Bare
strings are `must`. The *why* states the real cost of breaking the rule —
weigh it accordingly. A parent task's constraints bind every step inside it;
a child may add stricter rules, never weaken a parent `must`. Shared
module-level rule lists (`SOME_RULES + [...]`) apply wherever referenced.

## The pipeline (inside an orchestrator Task)

Class-body assignments, in dependency order — variables are the wiring:

```python
events = ScanThings(limit=limit)                       # step; kwargs bind inputs
plans  = [Triage(data=it) for it in events.items]      # fan-out: once per item
paid   = [Pay(id=p.id, plan=p.plan)                    # filtered fan-out:
          for p in plans if p.plan.tier in ["a", "b"]] #  membership only
mark   = MarkDone(n=events.count) if plans else None   # gate: skip if false
report = Digest(all_results=paid)                      # bare var = whole list
```

- `Var.field` = that field of the step's result; for fan-out steps, results
  collect into a list (`paid` is `list[ResultModel]`, `plans.plan` is a list
  of plans).
- Comprehension `if` filters items **mechanically**: only membership /
  equality against the listed literals. Apply it exactly; it is routing,
  not judgment.
- `X(...) if cond else None`: run X only when `cond` (a boolean result field)
  is true.
- The orchestrator itself is the reducer: after its steps, synthesize its own
  `returns` from the collected results.

## Failure semantics

Apply these **exactly as declared** — never substitute your own recovery:

- `on_failure = "abort"` — stop; then perform the `undo` declarations of
  already-completed steps in **reverse order** (saga unwind), then report.
- `on_failure = {...literal...}` — return that declared default and continue.
- `Retry(max=N, backoff_s=S, then=...)` — up to N fresh attempts, then `then`.
- `Escalate(channel=..., timeout_s=T, then=...)` — notify that channel, wait
  up to T for a human, then `then`.
- `on_uncertain` — the output to return when you genuinely cannot decide;
  choosing it is always legitimate and never a failure.

'''
#Here is the pspec file.

"""BookBank headless book generation — dispatched manually or by webhook, runs
unattended. Lean-dialect PromptSpec translation of the prose routine.

v2.0.0 — corrected after the blocked run of 2026-07-31 against sunprema/books#116.
v2.0.1 — Tool declarations are capabilities, not binaries; bookbank plugin strict.
v2.0.2 — field-report rules: branch authority, shared-disk, conservative parse,
script-as-specification.
v2.0.3 — from the run of 2026-08-01 (issue #122, shipped as draft PR #123) and
its duplicate webhook re-fire. That run succeeded; every item below is friction
it worked around. (1) declared tools narrower than the mandated procedure;
(2) reducer dropped validator_errors; (3) PushAlert blind to art/notify;
(4) duplicate-trigger unmodelled — alerting now a declared mapping;
(5) clone op undeclared; (6) freeform-named issue unverified; (7) on_uncertain
hardcoded generation_failed; (8) transitive SKILL.md closure; (9) meta/dispatch,
label_created, shared-disk conditional.
v2.0.4 — toolchain-found: `outcome=outcome` bound a name that exists only
after reduction. PushAlert now derives outcome from the orchestrator's
declared mapping over its own inputs; first spec to want a declared
intermediate derivation (noted, not yet syntax, per the two-failure rule).
v2.0.5 — from the stalled run of 2026-08-01, which sat on a permission prompt
asking to modify the plugin's own skills/book-progress/assets/book-progress.js.
Root cause: GenerateBook's tools were written for the skill_command path, where
the strict plugin tool does every file write internally. Its degradation branch
makes the model hand-execute write-book with a tool list whose only file verb is
`read` and whose only scope is <plugin_root> — so the one blessed path in hand
at write time was the plugin's own. (1) books_dir was never passed to
GenerateBook, so no book-scoped path could even be declared; (2) no write tool,
and no read scope over the books checkout; (3) plugin read-only was forbidden
only by omission; (4) `bash` was scripts-only, so the SKILL.md `cp` steps had no
mechanism — they now call library/vendor.sh, whose non-zero exits are declared
(precondition/ordering vs. the plugin-root boundary) and whose absence in an
older install cache must not reopen the freehand copy; (5) UNATTENDED let a *denied*
operation be re-read as an absent mechanism and substituted around; (6) PushAlert
conditions dereferenced inputs that are None on a gated run. A degradation branch
that does by hand what a strict tool did invisibly needs a LARGER tool list than
the happy path, not the tail of it.
"""

from pydantic import BaseModel, Field
from promptspec import Task, Tool, Enum, Retry


UNATTENDED = [
    ("Never ask questions; if anything is ambiguous, choose the conservative "
     "branch and record the ambiguity in the run report",
     "there is no human on the other end of this run"),
    ("Never mutate a GitHub issue — label, comment, or close — before the run "
     "has proven it can actually do the work",
     "a 'work started' comment from a run that then dies is noise the next run "
     "and the human both have to untangle", "must"),
    ("Never install, fetch, or enable software that no task declares. If a "
     "declared step cannot run without it, take that step's declared "
     "degradation branch and record it",
     "v2.0.3(1): the 2026-08-01 run installed an image encoder to satisfy a "
     "mandated cover step. It worked, and it silently widened what the routine "
     "may do to fix a cosmetic loss — the expensive kind of success", "must"),
    ("A permission denial is NOT an absent mechanism. Tool substitution covers a "
     "mechanism that is missing (binary absent, endpoint down); an operation the "
     "environment refuses is a declared boundary. Never reach the same effect by "
     "another tool, another path spelling, or a shell equivalent — take the "
     "task's declared failure branch and report what was refused",
     "v2.0.5(5): substitution and refusal look identical from inside the tool "
     "call, and the deny rules that stop a run from corrupting the plugin are "
     "worth nothing if a capable runtime treats them as an obstacle to route "
     "around", "must"),
]


class Workspace(BaseModel):
    resolved: bool
    books_dir: str
    repo_slug: str
    cwd_was_outside: bool

class PluginStatus(BaseModel):
    usable: bool
    execution_mode: Enum["skill_command", "on_disk_skill_files", "none"]
    plugin_root: str
    installed_now: bool
    registration_failed: bool

class IssueRef(BaseModel):
    found: bool
    proceed: bool
    number: int = Field(ge=0)
    redo_requested: bool
    already_in_progress: bool
    stale_branch: str

class StartMark(BaseModel):
    marked: bool

class BookBuild(BaseModel):
    built: bool
    book_id: str
    branch: str
    validator_errors: int = Field(ge=0)
    cover_rendered: bool
    visual_qa_ran: bool
    pr_url: str

class ImageRequests(BaseModel):
    opened_count: int = Field(ge=0)
    status: Enum["ok", "no_slots", "errored_noted"]

class IssueNote(BaseModel):
    commented: bool

class Alert(BaseModel):
    sent: bool
    suppressed_reason: str

class RunReport(BaseModel):
    outcome: Enum["published_draft", "published_with_errors", "no_work",
                  "already_in_progress", "workspace_failed", "plugin_failed",
                  "generation_failed", "uncertain"]
    stopped_at: Enum["resolve_workspace", "verify_plugin", "select_issue",
                     "mark_started", "generate_book", "complete"]
    validator_errors: int = Field(ge=0)
    summary: str = Field(max_length=500)
    operator_action: str = Field(max_length=300)


class ResolveWorkspace(Task):
    """Find the books checkout and make it the working directory before any
    bookbank tooling runs. The working directory IS the configuration."""
    returns: Workspace

    tools = [Tool("bash", ops=["ls", "cd", "git remote", "git rev-parse",
                               "git clone"])]
    constraints = UNATTENDED + [
        ("cd into the books checkout before invoking any bookbank tooling; a "
         "checkout sitting in a subdirectory of cwd is NOT the working directory",
         "repo-slug derivation, the data-root cascade, and the checkout's own "
         ".claude/settings.json all key off cwd", "must"),
        ("A directory qualifies only if it contains books/ or catalog.json; "
         "derive repo_slug from its origin remote",
         "derivation from an unrelated project would quietly retarget the run"),
        ("If the checkout is absent, clone it; if it cannot be resolved, stop — "
         "never guess a repo slug",
         "guessing writes a book into the wrong library"),
        ("Set cwd_was_outside when the session did not start inside the checkout, "
         "even after a successful recovery",
         "a recovered run still indicates a dispatch misconfiguration"),
    ]
    on_uncertain = {"resolved": False, "books_dir": "", "repo_slug": "",
                    "cwd_was_outside": True}
    on_failure = {"resolved": False, "books_dir": "", "repo_slug": "",
                  "cwd_was_outside": True}


class VerifyPlugin(Task):
    """Establish whether the bookbank skills can actually be executed in THIS
    session, and by which of the two legitimate mechanisms."""
    returns: PluginStatus

    tools = [
        Tool("bash", ops=["claude plugin marketplace add", "claude plugin install",
                          "claude plugin list", "ls"]),
        Tool("read", paths=["<plugin_root>/skills/**", "<plugin_root>/library/**"]),
    ]
    constraints = UNATTENDED + [
        ("A zero exit from `claude plugin install`, and a line in "
         "`claude plugin list`, are NOT evidence the skill is usable. Usability "
         "means the skill is invocable in the session that is running now",
         "plugins resolve at session start; a mid-run install registers only in "
         "the NEXT session — confirmed 2026-08-01", "must"),
        ("If unavailable, try exactly one install (bookbank@kit), then re-check",
         "one bounded repair attempt; unattended runs must not loop on setup"),
        ("If the skills are not invocable but the plugin IS unpacked on disk, set "
         "execution_mode='on_disk_skill_files' and proceed: read the plugin's own "
         "SKILL.md files and follow their procedures literally, using the plugin's "
         "own library/validate_book.py and library/place_image.py",
         "executing the plugin's real instructions from disk preserves the "
         "validator, the image-slot contract, and the house design", "must"),
        ("on_disk_skill_files requires READING the whole plugin tree. If those "
         "reads are refused rather than merely absent, the mode is unavailable: "
         "set execution_mode='none' and let the run stop at this gate. Never "
         "reconstruct the procedure from memory or from a partial read",
         "v2.0.5: the books checkout allows plugin reads explicitly and denies "
         "plugin writes; a refused READ means the environment is misconfigured, "
         "and half a procedure produces a book that looks right and skips the "
         "contracts", "must"),
        ("The on-disk procedure is the TRANSITIVE closure: create-book-from-issue, "
         "the write-book SKILL.md it defers to, and every skill those defer to in "
         "turn (book-diagrams, book-progress, typeset-cover, book-visual-qa). Read "
         "each before relying on it",
         "v2.0.3(8): naming only the first two understates the procedure; "
         "discovering the rest is judgment doing a declaration's job", "must"),
        ("NEVER author a book from your own judgement, from the books repo's own "
         "conventions, or from any skill not shipped by this plugin — regardless "
         "of execution_mode",
         "a book produced outside the plugin's procedure silently skips the "
         "structural validator, the image-slot contract, and the house design", "must"),
        ("Set registration_failed whenever the plugin is on disk but not "
         "invocable, even when on_disk_skill_files rescues the run",
         "that flag is the run's only signal that the dispatch config needs a "
         "one-time fix"),
        ("usable = execution_mode in ['skill_command', 'on_disk_skill_files']",
         "one boolean carries the go/no-go so every later step gates on it", "must"),
    ]
    on_uncertain = {"usable": False, "execution_mode": "none", "plugin_root": "",
                    "installed_now": False, "registration_failed": False}
    on_failure = {"usable": False, "execution_mode": "none", "plugin_root": "",
                  "installed_now": False, "registration_failed": False}


class SelectIssue(Task):
    """Resolve which issue to process: freeform run context first, else the
    oldest open book-request not already in progress."""
    freeform_context: str
    repo_slug: str
    returns: IssueRef

    tools = [Tool("gh", ops=["issue list", "issue view", "branch list"])]
    constraints = UNATTENDED + [
        ("Freeform context naming an issue wins over queue order, but ONLY after "
         "verifying by command that the named issue is OPEN and carries the "
         "'book-request' label. If it does not, ignore the name and fall back to "
         "queue order; if the queue is then empty, found is false",
         "v2.0.3(6): a webhook fires on issues it was never meant to aim this "
         "routine at; an unguarded name would point a book build at a bug report",
         "must"),
        ("A dispatch context that merely NAMES an issue — a webhook payload, a "
         "trigger record — is not a request to redo it",
         "v2.0.3(4): issues.opened re-fires for an issue this routine already "
         "claimed; reading the payload as intent would restart finished work"),
        ("Queue pick: oldest open 'book-request' WITHOUT the 'in-progress' label",
         "oldest-first keeps the queue fair; the label filter is the duplicate guard"),
        ("redo_requested is true only if the freeform text explicitly says redo/restart",
         "redoing an in-progress book must be a human's explicit call, never inferred"),
        ("Record any existing claude/book-<n>-* branch in stale_branch; treat a "
         "prior run's 'work started' comment WITHOUT the in-progress label as "
         "abandoned, not as active work",
         "an unwound run leaves its comments behind; reading those as a live claim "
         "would deadlock the queue permanently", "must"),
        ("proceed = found AND (NOT already_in_progress OR redo_requested); number is 0 when found is false",
         "one boolean carries the whole go/no-go decision", "must"),
    ]
    on_uncertain = {"found": False, "proceed": False, "number": 0,
                    "redo_requested": False, "already_in_progress": False,
                    "stale_branch": ""}
    on_failure = {"found": False, "proceed": False, "number": 0,
                  "redo_requested": False, "already_in_progress": False,
                  "stale_branch": ""}


class MarkStarted(Task):
    """Label the issue in-progress and comment, BEFORE any generation work and
    ONLY once the run has proven it can generate."""
    issue_number: int
    returns: StartMark

    tools = [Tool("gh", ops=["issue edit", "issue comment", "label create"])]
    constraints = UNATTENDED + [
        ("Add 'in-progress' and the work-started comment before generation begins",
         "the label is the mutex", "must"),
        ("Reaching this task at all requires a usable plugin and a resolved "
         "workspace; never run it speculatively",
         "this is the first irreversible, publicly visible act of the run", "must"),
        ("Create the in-progress label first if the repo lacks it",
         "a fresh repo must not fail the guard for a missing label"),
    ]
    undo = ("Remove the in-progress label and comment what went wrong on the issue, "
            "so the request returns to the queue instead of looking stuck forever")
    on_failure = "abort"


class GenerateBook(Task):
    """Run the create-book-from-issue procedure, then commit, push the branch,
    open the draft PR (or produce the compare-URL fallback)."""
    issue_number: int
    execution_mode: str
    plugin_root: str
    books_dir: str
    stale_branch: str
    returns: BookBuild

    tools = [
        Tool("bookbank-plugin", ops=["create-book-from-issue"], strict=True),
        # The plugin is READ scope only. The books checkout is the only write
        # scope, and it must be declared for BOTH verbs: on_disk_skill_files
        # authors every page, manifest and stylesheet by hand, and re-reads them
        # to resume — work the strict tool above does invisibly on the happy path.
        Tool("read", paths=["<plugin_root>/skills/**", "<plugin_root>/library/**",
                            "<plugin_root>/defaults/**", "<plugin_root>/widgets/**",
                            "<books_dir>/books/**"]),
        Tool("write", paths=["<books_dir>/books/**"]),
        Tool("python3", scripts=["<plugin_root>/library/validate_book.py",
                                 "<plugin_root>/library/place_image.py",
                                 "<plugin_root>/skills/book-visual-qa/scripts/qa-book.py"]),
        Tool("bash", scripts=["<plugin_root>/library/vendor.sh",
                              "<plugin_root>/skills/typeset-cover/scripts/render-cover.sh",
                              "<plugin_root>/skills/write-book/scripts/build-three-bundle.sh"]),
        Tool("headless-browser", ops=["render", "screenshot"]),
        Tool("webp-encoder", ops=["encode"]),
        Tool("git", ops=["add", "commit", "push", "branch"], exclusive=True),
        Tool("gh", ops=["pr create"]),
    ]
    constraints = UNATTENDED + [
        ("When execution_mode is 'on_disk_skill_files', read create-book-from-issue/"
         "SKILL.md, the write-book SKILL.md it defers to, and every skill those "
         "defer to in turn, and follow them as written — including every validator, "
         "visual-QA and image-slot step",
         "the plugin's SKILL.md is the procedure", "must"),
        ("plugin_root is READ-ONLY. Never write, edit, append to, or copy onto any "
         "path under it. Everything this task creates goes under "
         "<books_dir>/books/<book_id>/. A SKILL.md step that vendors a runtime "
         "(book-progress.js, book-widgets.js, book-three.js, diagram-kit.css) is "
         "performed by `library/vendor.sh <books_dir>/books/<book_id> <asset>` — "
         "the BOOK's own folder, never books_dir and never a path spelled out by "
         "hand; the script holds the plugin-side path itself. If a step still "
         "seems to call for editing a plugin file, the step has been misread",
         "v2.0.5: the plugin tree is a shared install cache — or, under a "
         "`directory` marketplace, the kit checkout itself — so a write there "
         "changes every future book, and the permission prompt it raises has "
         "nobody to answer it: the run stalls holding the in-progress label and "
         "PushAlert never fires", "must"),
        ("vendor.sh states its preconditions and exits non-zero on them: the book "
         "folder must already hold book.json, and diagram-kit.css appends to an "
         "assets/book.css that must already exist. Those exits are an ORDERING "
         "error in this run — satisfy the precondition and re-run the same "
         "command, do not abort and do not hand-copy around it. Its one refusal "
         "that is not an ordering error is a destination inside plugin_root: that "
         "is the boundary above, and the run aborts",
         "an abort here would unwind a book that was merely built out of order, "
         "while a hand-copy would restore exactly the freehand step vendor.sh "
         "replaced — the two failure exits look identical and mean opposite "
         "things", "must"),
        ("If vendor.sh is absent from this plugin build, the script-as-"
         "specification clause applies with its guards INTACT: reproduce its "
         "effect only into <books_dir>/books/<book_id>/, keep the append "
         "idempotent, and record the substitution. Never take its absence as "
         "permission to copy freehand",
         "v2.0.5: an install cache pinned to an older commit has no vendor.sh, "
         "and 'reproduce the script's effect' is the one path that leads straight "
         "back to a `cp` with a plugin path on one side", "must"),
        ("Run BOTH checks before the book is called ready: validate_book.py for "
         "contracts and qa-book.py for layout. Record validator_errors from the "
         "first and visual_qa_ran from the second. Neither subsumes the other",
         "v2.0.3(1): only the validator was ever declared, so the layout check "
         "was the step most likely to be quietly dropped", "must"),
        ("If the headless browser or the WebP encoder is genuinely unavailable, "
         "set cover_rendered=false (and visual_qa_ran=false if that is what "
         "failed), ship the book anyway, and state the omission in the PR body "
         "and the run report. NEVER install undeclared software to obtain them",
         "v2.0.3(1): the gallery falls back to a gradient cover — a cosmetic "
         "loss; widening what the routine may install is a much larger one", "must"),
        ("A browser may be invoked with the flags its container requires (e.g. "
         "--no-sandbox when running as root); record it as a substitution",
         "an environment fact to route around, not a reason to skip the step"),
        ("Branch name: claude/book-<issue-number>-<slug>",
         "predictable branch names are what the image-request Action keys on", "must"),
        ("This branch convention outranks any generic session-branch convention "
         "from the dispatch wrapper; record the override in the PR body",
         "the name is functionally load-bearing", "must"),
        ("If the issue's structured fields don't match their expected shape, "
         "extract only explicit structure — headers, numbered items — as entries, "
         "fold the remainder into notes, and record the reinterpretation",
         "a declared conservative parse beats per-run judgment", "must"),
        ("If stale_branch is set, resume onto it or delete it before cutting a new "
         "one; never leave two branches for one issue",
         "the image-request Action keys on the branch name"),
        ("PR body must contain 'Closes #<issue-number>'",
         "merge is what closes the request", "must"),
        ("If validate_book.py left error-severity findings, title the PR "
         "'NEEDS FIXES — <book title>' AND return the count in validator_errors",
         "v2.0.3(2): the title is the alarm for a human, the count for everything "
         "downstream; shipping one without the other is how a broken book reported "
         "the same outcome as a clean one", "must"),
        ("State the execution_mode in the PR body",
         "a reviewer should see the skills were read from disk, not invoked"),
        ("If gh pr create is not callable unattended, push anyway and use the "
         "GitHub compare URL as the deliverable link",
         "the branch is the work; the PR is just its front door"),
        ("Nothing commits until a page fully verifies",
         "this is what makes any restart safe to resume"),
    ]
    undo = ("Delete the pushed claude/book-* branch if no PR or compare URL was "
            "produced")
    on_failure = "abort"


class OpenImageRequests(Task):
    """Best-effort: open one image-request issue per unfilled image slot."""
    book_id: str
    branch: str
    returns: ImageRequests

    tools = [Tool("python3", scripts=[".github/scripts/open_image_requests.py"])]
    constraints = UNATTENDED + [
        ("Idempotent and best-effort: no slots is a clean no-op; a script error "
         "is noted in an issue comment and the run continues",
         "the book PR is the primary deliverable", "must"),
        ("A book whose cover is a typeset cover.webp and which declares no "
         "images[] is status='no_slots', not an error",
         "type-led themes ship complete with no art round-trip"),
        ("Each request carries the book, the slot, and THIS PR branch",
         "the art-approved Action commits onto this branch"),
        ("If the script's internal gh dependency is absent in this harness, the "
         "script is the specification: read it for the exact marker format and "
         "open the same issues via available GitHub mechanisms at the same scope",
         "errored_noted is for real failures, not environment mismatch", "must"),
    ]
    on_failure = {"opened_count": 0, "status": "errored_noted"}


class NotifyIssue(Task):
    """Comment the PR link (or compare URL) back on the originating issue."""
    issue_number: int
    pr_url: str
    returns: IssueNote

    tools = [Tool("gh", ops=["issue comment"])]
    constraints = UNATTENDED + [
        ("On success LEAVE the in-progress label on",
         "the PR's 'Closes #' handles closure at merge", "must"),
    ]
    on_failure = Retry(max=3, backoff_s=30, then={"commented": False})


class PushAlert(Task):
    """Reach the operator's phone. This is the run's only channel to a human;
    the transcript is read by nobody."""
    workspace: Workspace | None
    plugin: PluginStatus | None
    issue: IssueRef | None
    build: BookBuild | None
    art: ImageRequests | None
    notify: IssueNote | None
    returns: Alert

    tools = [Tool("push-notification")]
    constraints = UNATTENDED + [
        ("FIRST derive outcome by applying the orchestrator's declared reduction "
         "mapping to these same inputs; every condition below refers to that "
         "derived value. Derive it once — the reducer must later produce the "
         "identical value from the identical mapping",
         "outcome is needed before the reduction step exists; deriving it twice "
         "from one declared table is consistent, piping a value that does not "
         "yet exist is not", "must"),
        ("Send exactly one notification, and only after diagnosis has converged — "
         "state what was verified by command and what is inferred, and never "
         "assert a root cause that has not been checked",
         "the 2026-07-31 run pushed a confident wrong root cause that could not "
         "be corrected", "must"),
        ("Any condition below that reads a field of an input which is None — a "
         "step the run never reached — is FALSE, never true and never a reason to "
         "stop. Only the outcome conditions speak for a gated run",
         "v2.0.5(6): every field condition here dereferences a step that a gated "
         "run skipped; read as undefined they turn a clean stop into an error, "
         "read as true they alert on work that never happened", "must"),
        ("NOTIFY when any of these hold: "
         "outcome in ['workspace_failed', 'plugin_failed', 'generation_failed', "
         "'uncertain']; "
         "OR build.validator_errors > 0; "
         "OR notify.commented is False; "
         "OR art.status == 'errored_noted'; "
         "OR build.cover_rendered is False OR build.visual_qa_ran is False; "
         "OR (plugin.registration_failed AND outcome in ['published_draft', "
         "'published_with_errors'])",
         "these are the states where a human's attention changes the outcome. "
         "v2.0.3(3): notify and art were previously invisible to this task", "must"),
        ("STAY SILENT when outcome in ['no_work', 'already_in_progress'], or on a "
         "clean 'published_draft' with no condition above set; record "
         "suppressed_reason instead",
         "an empty queue is not news, a re-fire on a claimed issue is not news", "must"),
        ("A standing condition alerts only on a run that did work. Never re-alert "
         "an unchanged condition on a run that stopped at a gate",
         "v2.0.3(4): registration_failed is true on every run until fixed; firing "
         "on each duplicate webhook buries the signal", "must"),
        ("Lead with the sentence the operator would act on",
         "the first sentence becomes the phone banner"),
    ]
    on_failure = {"sent": False, "suppressed_reason": "alert channel failed"}


class BookbankRun(Task):
    """Headless book generation: establish workspace, verify tooling, claim an
    issue, build, PR, request art, notify. Fully unattended — never asks."""
    freeform_context: str
    returns: RunReport

    workspace = ResolveWorkspace()
    plugin    = VerifyPlugin() if workspace.resolved else None
    issue     = SelectIssue(freeform_context=freeform_context,
                            repo_slug=workspace.repo_slug) if plugin.usable else None
    mark      = MarkStarted(issue_number=issue.number) if issue.proceed else None
    build     = GenerateBook(issue_number=issue.number,
                             execution_mode=plugin.execution_mode,
                             plugin_root=plugin.plugin_root,
                             books_dir=workspace.books_dir,
                             stale_branch=issue.stale_branch) if mark.marked else None
    art       = OpenImageRequests(book_id=build.book_id,
                                  branch=build.branch) if build.built else None
    notify    = NotifyIssue(issue_number=issue.number,
                            pr_url=build.pr_url) if build.built else None
    alert     = PushAlert(workspace=workspace, plugin=plugin, issue=issue,
                          build=build, art=art, notify=notify)

    constraints = UNATTENDED + [
        ("Every step after ResolveWorkspace is gated on the step before it "
         "reporting success; a false gate is a clean stop, never an error",
         "an ungated step claimed an issue the run could not deliver", "must"),
        ("Do not proceed past SelectIssue when found is false, or when "
         "already_in_progress is true without redo_requested",
         "an empty queue and a claimed issue are both clean stops", "must"),
        ("Reduce to RunReport by this mapping, in order — first match wins: "
         "NOT workspace.resolved -> ('workspace_failed', 'resolve_workspace'); "
         "NOT plugin.usable -> ('plugin_failed', 'verify_plugin'); "
         "NOT issue.found -> ('no_work', 'select_issue'); "
         "issue.already_in_progress AND NOT issue.redo_requested -> "
         "('already_in_progress', 'select_issue'); "
         "NOT build.built -> ('generation_failed', 'generate_book'); "
         "build.validator_errors > 0 -> ('published_with_errors', 'complete'); "
         "otherwise -> ('published_draft', 'complete'). "
         "Always copy build.validator_errors into RunReport.validator_errors (0 "
         "when no build ran)",
         "v2.0.3(2): a closed set that cannot distinguish a NEEDS FIXES ship from "
         "a clean one has stopped being a routing key", "must"),
        ("PushAlert is the last action on EVERY terminal path, including after a "
         "saga unwind; an abort that skips it is a failed run by definition",
         "a routine that finds the problem and never reaches the phone has failed "
         "at its only job", "must"),
        ("Populate operator_action whenever the run needed a human to change "
         "configuration — name the file or setting, not just the symptom",
         "the value of a blocked run is a fix the human can apply once"),
        ("If killed mid-build, resumption is safe: nothing commits until a page "
         "verifies, so re-check book.json and relaunch the next unbuilt page",
         "restart resilience is a property of the commit discipline"),
        ("WHEN GenerateBook is delegated to a separate executor sharing this "
         "checkout, the orchestrator performs no git operations in books_dir "
         "while it runs, and treats the executor's untracked in-progress files "
         "as expected, not actionable. An inline build has one pair of hands and "
         "this does not apply",
         "v2.0.3(9): stated unconditionally, the rule reads as forbidding the "
         "inline build's own commits"),
    ]
    on_uncertain = {"outcome": "uncertain",
                    "stopped_at": "resolve_workspace",
                    "validator_errors": 0,
                    "summary": "Genuinely could not decide; see operator_action. "
                               "stopped_at names the last stage entered; any "
                               "completed step's undo has been run in reverse.",
                    "operator_action": "Inspect the run transcript before re-dispatching."}
    on_failure = "abort"
    meta = {"version": "2.0.5", "dispatch": "manual|webhook", "repo": "sunprema/books"}
