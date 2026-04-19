# ScatterPlot 3D — 인수인계 (그래픽 관점 → 생물학 관점 전환 작업 중)

> **핵심 메시지**: 지금까지의 3D는 "3D처럼 보이게 하는" 그래픽 관점의 구현이었고, 이는 **생물학적으로 틀린 시각화**였습니다. 현재 이를 **생물학적으로 올바른 3D UMAP**으로 교체하는 작업이 진행 중입니다. 이 문서는 그 맥락과 남은 작업을 인계합니다.

---

## 1. 배경: "3D"라는 단어의 두 가지 의미

시각화에서 "3D"는 전혀 다른 두 개념을 가리킬 수 있습니다.

### 1-1. 그래픽 관점의 3D (우리가 잘못 하고 있던 것)

**"화면에 깊이감(z축) 있게 그리기"**. 카메라 회전, 원근감, 조명 같은 **렌더링 기법**의 문제.

이 관점에서는 z 좌표가 **어디서 오는지는 중요하지 않음**. 그냥 "멋진 회전 화면"만 만들면 됨.

### 1-2. 생물학 관점의 3D (우리가 해야 하는 것)

**"17,695차원의 세포 데이터를 3차원으로 축소한 의미 있는 좌표"**.

여기서 x, y, z는 **같은 차원 축소 알고리즘(UMAP)의 출력**이어야 합니다. 그래야:
- 가까운 점끼리 → 실제로 유사한 세포
- 먼 점끼리 → 실제로 다른 세포

**좌표 자체에 생물학적 의미**가 담겨야 합니다.

---

## 2. 무엇이 잘못되어 있었나

### 2-1. Mock 데이터 (데모용)

`src/mock-data.ts`의 `generateUMAPData()`:

```ts
// 클러스터 인덱스 × 1.5 를 z축 중심으로 사용
const cz = (CELL_TYPES.indexOf(ct) - CELL_TYPES.length / 2) * 1.5;
z[idx] = randNormal(cz, 0.8);  // ← 그냥 랜덤값
```

**z가 완전히 임의값**. 클러스터별로 z 층만 다르게 깔아서 "3D처럼 보이게" 한 것. 생물학적으로는 **아무 의미 없음**.

### 2-2. 실제 데이터 (GTEx 등)

`benchmark-server/main.py`의 `load_h5ad_dataset()`:

```python
# Try to get z coordinate from X_pca (3rd component)
if "X_pca" in h5["obsm"]:
    z_arr = pca[:, 2].astype(np.float32)
```

**x, y는 UMAP 2D 좌표 / z는 PCA의 3번째 성분**. 이 둘은 **완전히 다른 알고리즘의 출력**이라 좌표 공간 자체가 다름.

비유하자면 "위도/경도(지도 좌표)"에 "GDP 수치"를 z로 붙인 꼴. 점이 떠 보이기는 해도 **"가까움 = 유사함"이라는 해석이 성립하지 않음**.

### 2-3. 왜 이게 문제였나

연구자가 3D 그림을 보고 "아, 이 두 클러스터는 z축으로 잘 분리되는구나"라고 해석할 때, 그 z는 **아무것도 의미하지 않는 노이즈**였습니다. 결론을 **생물학적으로 오해**할 수 있는 상태.

---

## 3. 현재 진행 중인 수정

### 3-1. 방향

모든 데이터셋에 대해 **진짜 3D UMAP을 한 번 계산해서 저장**해두고, 런타임에는 그 좌표를 그대로 가져다 씀.

- 오프라인: `umap-learn` Python 패키지로 `UMAP(n_components=3)` 실행
- 저장: SQLite DB의 `scatter_<dataset>` 테이블 (컬럼: `x`, `y`, `x3`, `y3`, `z3`, `label`)
- 런타임: 서버는 DB에서 SELECT만, 브라우저는 그 좌표 받아 렌더링

### 3-2. 주요 변경 파일

**seegak-test (서버/데이터 파이프라인)**
| 파일 | 변경 내용 |
|---|---|
| `benchmark-server/build_viz_cache.py` | `_compute_3d_umap()` 추가 — PCA → UMAP 3D 계산, DB에 저장 |
| `benchmark-server/main.py` | `load_h5ad_dataset()` — DB에서 `z3` 읽도록 변경, h5py는 폴백으로만 |
| `benchmark-server/requirements.txt` | `umap-learn`, `scipy` 추가 |
| `benchmark-server/Dockerfile` | 이미지 빌드 시 `build_viz_cache.py` 자동 실행 |

**seegak (라이브러리)**
- 3D 렌더링 자체는 이미 생물학-중립 (x, y, z 받아 그림)
- 수정 없음 — 입력 데이터만 올바르면 됨

---

## 4. 현재 상태 (2026-04-20 기준)

### 4-1. 완료된 것

- ✅ `build_viz_cache.py`에 3D UMAP 계산 로직 추가
- ✅ SQLite DB 스키마 확장 (x3, y3, z3 컬럼)
- ✅ `/api/scatter.zarr` 엔드포인트가 DB 기반으로 동작
- ✅ GTEx (209k 세포) 3D UMAP 계산 검증 — ~107초 소요
- ✅ `umap-learn` 의존성 Docker 이미지에 포함

### 4-2. 아직 안 된 것 / 검증 필요

- ⚠️ **`Scatter3DView`가 현재 `x, y` + `z3` 조합**으로 렌더링 중 (절반만 올바름)
  - 이상적: `x3, y3, z3` 세 개 모두 UMAP 3D에서 와야 함
  - 현재: `x, y`는 UMAP 2D, `z`만 UMAP 3D의 z3 컴포넌트 → 여전히 좌표 공간 불일치
  - 이유: 2D 토글 시 기존 UMAP 2D 레이아웃 유지를 위한 과도기적 선택
- ⚠️ **Mock 데이터는 여전히 가짜 z 사용**
  - 데모 용이라 우선순위 낮지만, 인수인계 받는 사람이 혼동하지 않도록 처리 필요
- ⚠️ **다른 h5ad 데이터셋**은 아직 3D UMAP 재계산 안 됨 (GTEx만 됨)

### 4-3. 권장 다음 작업 순서

1. **전체 3D UMAP 일관성 확보**: 3D 모드일 때는 `x3, y3, z3`를 모두 전달하도록 API/프론트 수정. 2D 모드와 3D 모드는 **서로 다른 좌표 공간**이라는 점을 UI에서도 명시.
2. **Mock 데이터 수정**: 가짜 z 생성 대신, mock용으로도 실제 3D UMAP스러운 분포 만들거나 3D 토글 자체를 비활성화.
3. **나머지 h5ad 데이터셋 처리**: Docker 이미지 리빌드로 일괄 처리 가능.
4. **검증 시각화**: 같은 데이터셋의 UMAP 2D와 UMAP 3D 결과를 나란히 놓고, 2D에서 겹쳐 보이던 클러스터가 3D에선 분리되는지 눈으로 확인.

---

## 5. 인수인계 받는 사람이 알아야 할 생물학 최소 지식

이 섹션은 생물학 배경이 없는 개발자가 "왜 이게 중요한지" 감을 잡기 위한 부분입니다.

### 5-1. 필수 개념 4개

| 개념 | 한 줄 설명 |
|---|---|
| **세포 (cell)** | 생물 최소 단위. 사람 몸에 40조 개. 이 차트에선 **점 1개 = 세포 1개** |
| **세포 종류 (cell type)** | 몸 안의 세포는 역할별로 다름 (폐 세포, T cell, 뉴런 등). 보통 20-100종 분류 |
| **유전자 발현 (gene expression)** | 각 세포가 2만 개 유전자를 얼마만큼씩 "켜고 있는지" 수치로 측정 |
| **UMAP** | 수만 차원 데이터를 **가까운 것끼리 가깝게** 유지하면서 2D/3D로 줄이는 알고리즘 |

### 5-2. 한 데이터셋의 수치 스케일 (GTEx 기준)

- 세포 수: **209,126개**
- 유전자 수: **17,695개**
- 0이 아닌 발현값 개수: **1억 7천만 개**
- 이걸 2D/3D UMAP으로 줄여서 시각화

### 5-3. "좌표 공간이 다르다"는 말이 무슨 뜻인가

차원 축소는 **무한히 많은 정답**이 가능합니다. UMAP을 2D로 돌리면 한 가지 레이아웃이 나오고, 3D로 돌리면 완전히 다른 레이아웃이 나옵니다. 두 레이아웃의 "x, y 축"은 **이름만 같을 뿐 의미가 다름**.

그래서 "2D UMAP의 x, y 위에 PCA z를 얹는다" = 서로 다른 공간을 억지로 합친 셈. 생물학적으로 해석 불가.

---

## 6. 컴포넌트 사용법 (참고용)

현재 구현 기준. 마이그레이션 완료 후 API가 바뀔 수 있음.

```tsx
import { ScatterChart } from '@seegak/react';

<ScatterChart
  data={{
    x: umapX,           // UMAP 2D x
    y: umapY,           // UMAP 2D y
    labels: cellTypes,
  }}
  z={umap3D_z}          // 현재는 UMAP 3D의 z 컴포넌트만
  enable3D
  pointSize={3}
/>
```

**TODO 표시**: 올바르게 고치려면 3D 모드 전용으로 `data3D={{ x: umap3D_x, y: umap3D_y, z: umap3D_z }}` 같은 prop을 추가하거나, `z` 외에 `x3`, `y3`도 받아야 함.

---

## 7. 관련 파일 위치

### seegak (라이브러리 쪽 — 렌더링만)
| 역할 | 경로 |
|---|---|
| React 래퍼 | `packages/react/src/ScatterChart.tsx` |
| 3D 뷰 코어 | `packages/3d/src/scatter/scatter3d-view.ts` |
| 3D WebGL 레이어 | `packages/3d/src/scatter/scatter3d-layer.ts` |
| 3D 카메라 | `packages/3d/src/math/arcball.ts` |
| 타입 | `packages/3d/src/types.ts` |

### seegak-test (데이터 파이프라인 — 이번 수정의 핵심)
| 역할 | 경로 |
|---|---|
| **3D UMAP 계산 스크립트** | `benchmark-server/build_viz_cache.py` |
| **DB 기반 로더** | `benchmark-server/main.py` (`load_h5ad_dataset`) |
| SQLite 파일 | `benchmark-server/viz_scatter.db` |
| Mock 데이터 (문제 있음) | `src/mock-data.ts` (`generateUMAPData`) |

---

## 8. 이해 체크리스트

다음 질문에 답할 수 있으면 이 작업을 이어받을 준비가 된 것입니다.

- [ ] 왜 기존 3D 구현이 "생물학적으로 틀렸다"고 말할 수 있나?
- [ ] UMAP 2D의 x,y와 UMAP 3D의 x,y가 **다른 좌표**인 이유는?
- [ ] 현재 DB에 저장된 `x, y` 와 `x3, y3, z3`는 각각 어디서 왔나?
- [ ] 3D UMAP 재계산은 언제/어디서 일어나나?
- [ ] 아직 남은 작업 3가지를 나열할 수 있나?

---

## 9. 참고 자료

- **UMAP 개념**: [Understanding UMAP](https://pair-code.github.io/understanding-umap/)
- **scRNA-seq 개요 (Python/scanpy)**: 튜토리얼 1개만 따라해보면 용어 감 잡힘
- **umap-learn 문서**: https://umap-learn.readthedocs.io/
- **이 프로젝트 2D 문서**: `docs/scatter-chart.md`
