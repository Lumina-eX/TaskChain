# Pinned toolchain and network configuration.
# Override on the command line, e.g. `make build RUST_TOOLCHAIN=1.84.0`.
RUST_TOOLCHAIN ?= 1.84.0
STELLAR_NETWORK ?= testnet
WASM_DIR := target/wasm32v1-none/release
WASM_NAME := escrow.wasm
ARTIFACT_DIR := artifacts

default: build

all: test

test: build
	cargo +$(RUST_TOOLCHAIN) test

build:
	stellar contract build
	@ls -l $(WASM_DIR)/*.wasm

artifact: build
	@mkdir -p $(ARTIFACT_DIR)
	@cp $(WASM_DIR)/*.wasm $(ARTIFACT_DIR)/$(WASM_NAME)
	sha256sum $(ARTIFACT_DIR)/$(WASM_NAME) > $(ARTIFACT_DIR)/$(WASM_NAME).sha256
	@echo "Artifact hash recorded in $(ARTIFACT_DIR)/$(WASM_NAME).sha256"

verify-artifact:
	@test -f $(ARTIFACT_DIR)/$(WASM_NAME).sha256 || (echo "error: missing recorded hash, run 'make artifact' first" && exit 1)
	sha256sum -c $(ARTIFACT_DIR)/$(WASM_NAME).sha256

fmt:
	cargo fmt --all

clean:
	cargo clean
	rm -rf $(ARTIFACT_DIR)
