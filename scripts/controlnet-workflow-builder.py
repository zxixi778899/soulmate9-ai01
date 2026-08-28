"""
ControlNet Multi-Unit Workflow Builder for ComfyUI
===================================================

This module builds ComfyUI JSON workflows with multiple ControlNet units
for pose, outfit, and scene control from preset reference images.

Integration Points:
- Called by `/api/gen/start` and `/api/chat/generate-image` via `runpod.ts`
- Runs on RunPod ComfyUI worker (flux1-dev-fp8 based)
- Requires custom nodes: CtrlNet_Aux_Preprocessors, ComfyUI_ControlNet_aux

Usage:
    python scripts/controlnet-workflow-builder.py \
        --base-workflow flux-text2img.json \
        --pose-preset dance_v1 \
        --outfit-preset summer_dress \
        --scene-preset beach_sunset

Output: Enhanced workflow JSON with ControlNet nodes inserted
"""

import json
import hashlib
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, asdict
from pathlib import Path


# ========== Configuration Constants ==========
DEFAULT_WEIGHTS = {
    'openpose': 0.72,
    'depth': 0.65,
    'canny': 0.82,
    'segment': 0.75,
    'ipadapter': 0.75,
}

DEFAULT_GUIDANCE = {
    'start': 0.1,
    'end': 0.95,
}

PROCESSOR_PRESETS = {
    'openpose': 'dw_openpose_full',
    'depth': 'midas_thorough',
    'canny': 'cv2_canny',
    'segment': 'sam_vit_b_01ec64',
}


@dataclass
class ControlNetUnitConfig:
    """Single ControlNet unit configuration"""
    type: str
    image_url: str
    weight: float = 0.8
    guidance_start: float = 0.0
    guidance_end: float = 1.0
    processor: str = 'auto'
    resolution: str = 'auto'
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class ControlNetWorkflowBuilder:
    """Build ComfyUI JSON workflow with multiple ControlNet units"""
    
    BASE_NODES = [
        # These are loaded from base workflow template
    ]
    
    def __init__(self, base_workflow_path: Union[str, Path]):
        """
        Initialize workflow builder
        
        Args:
            base_workflow_path: Path to base flux text2img workflow JSON
        """
        self.workflow = self._load_base_workflow(base_workflow_path)
        self.units: List[Dict[str, Any]] = []
        self.node_counter = self._count_nodes(self.workflow)
        
    def _load_base_workflow(self, path: Union[str, Path]) -> Dict[str, Any]:
        """Load base workflow from file"""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Base workflow not found: {path}")
        
        with open(path, 'r') as f:
            workflow = json.load(f)
        
        return workflow
    
    def _count_nodes(self, workflow: Dict[str, Any]) -> int:
        """Count existing nodes in workflow"""
        nodes = workflow.get('nodes', [])
        if not nodes:
            return 0
        max_id = max(int(node.get('id', 0)) for node in nodes)
        return max_id
    
    def _generate_node_id(self) -> str:
        """Generate unique node ID"""
        self.node_counter += 1
        return str(self.node_counter)
    
    def add_pose_unit(
        self, 
        openpose_json: str,
        weight: float = DEFAULT_WEIGHTS['openpose'],
        guidance_start: float = DEFAULT_GUIDANCE['start'],
        guidance_end: float = DEFAULT_GUIDANCE['end']
    ):
        """
        Add OpenPose ControlNet unit for pose control
        
        Inserts:
        - PreProcessor_OpenPose (extract skeleton from JSON or infer from image)
        - ControlNetLoader_OpenPose (load openpose.controlnet)
        - CLIPTextEncode (conditioning for pose)
        - ControlNetApply (apply to model conditioning)
        
        Args:
            openpose_json: URL to OpenPose JSON file (18 keypoints format)
            weight: ControlNet strength (0~1)
            guidance_start: When to start applying ControlNet (0~1)
            guidance_end: When to stop applying ControlNet (0~1)
        """
        unit_id = len(self.units)
        
        # 1. Insert PreProcessor node for OpenPose
        preprocessor_id = self._generate_node_id()
        preprocessor_node = {
            'id': preprocessor_id,
            'class_type': 'PreProcessor_OpenPose',
            'inputs': {
                'image_url': openpose_json,
                'resolution': 512,
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'openpose',
                'purpose': 'pose_control_from_skeleton',
            }
        }
        self.workflow['nodes'].append(preprocessor_node)
        
        # 2. Insert ControlNet loader
        controlnet_loader_id = self._generate_node_id()
        controlnet_loader_node = {
            'id': controlnet_loader_id,
            'class_type': 'ControlNetLoader_OpenPose',
            'inputs': {
                'controlnet_name': 'openpose_ft_sd15.safetensors',
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'openpose',
            }
        }
        self.workflow['nodes'].append(controlnet_loader_node)
        
        # 3. Insert CLIPTextEncode for Conditioning
        clip_encode_id = self._generate_node_id()
        clip_encode_node = {
            'id': clip_encode_id,
            'class_type': 'CLIPTextEncode',
            'inputs': {
                'text': '(full body, clear pose: 1.3)',
                'clip': ['1', 1],  # Will be connected to base workflow's CLIP output
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'openpose_conditioning',
            }
        }
        self.workflow['nodes'].append(clip_encode_node)
        
        # 4. Insert ControlNetApply node
        controlnet_apply_id = self._generate_node_id()
        controlnet_apply_node = {
            'id': controlnet_apply_id,
            'class_type': 'ControlNetApply',
            'inputs': {
                'control_net': [controlnet_loader_id],
                'conditioning': [clip_encode_id],
                'image': [preprocessor_id, 0],
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'openpose_apply',
            }
        }
        self.workflow['nodes'].append(controlnet_apply_node)
        
        # Store unit info
        self.units.append({
            'type': 'openpose',
            'unit_index': unit_id,
            'node_ids': {
                'preprocessor': preprocessor_id,
                'controlnet_loader': controlnet_loader_id,
                'clip_encode': clip_encode_id,
                'controlnet_apply': controlnet_apply_id,
            },
            'config': {
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            }
        })
        
        return self
    
    def add_outfit_unit(
        self,
        canny_edge: str,
        person_mask: str = None,
        weight: float = DEFAULT_WEIGHTS['canny'],
        guidance_start: float = DEFAULT_GUIDANCE['start'],
        guidance_end: float = DEFAULT_GUIDANCE['end']
    ):
        """
        Add Canny/Segment ControlNet unit for outfit try-on
        
        Inserts:
        - PreProcessor_Canny or PreProcessor_Segment (edge detection or segmentation)
        - ControlNetLoader_Canny (load canny.controlnet)
        - CLIPTextEncode (clothing preservation prompt)
        - ControlNetApply (apply to model conditioning)
        
        Args:
            canny_edge: URL to Canny edge map PNG
            person_mask: Optional segmentation mask for clothing region
            weight: ControlNet strength (0~1)
            guidance_start: When to start applying ControlNet (0~1)
            guidance_end: When to stop applying ControlNet (0~1)
        """
        unit_id = len(self.units)
        processor_type = 'segment' if person_mask else 'canny'
        
        if person_mask:
            # Segment-based outfit control
            preprocessor_id = self._generate_node_id()
            preprocessor_node = {
                'id': preprocessor_id,
                'class_type': 'PreProcessor_Segment',
                'inputs': {
                    'image_url': person_mask,
                    'target_class': 'person',
                    'output_target': 'clothing',
                },
                '_meta_': {
                    'unit_index': unit_id,
                    'type': 'segment',
                    'purpose': 'outfit_try_on_mask',
                }
            }
            self.workflow['nodes'].append(preprocessor_node)
            
            # Use the mask directly as ControlNet input
            control_input = [preprocessor_id, 0]
        else:
            # Canny edge for fabric texture preservation
            preprocessor_id = self._generate_node_id()
            preprocessor_node = {
                'id': preprocessor_id,
                'class_type': 'PreProcessor_Canny',
                'inputs': {
                    'image_url': canny_edge,
                    'lower_threshold': 100,
                    'upper_threshold': 200,
                },
                '_meta_': {
                    'unit_index': unit_id,
                    'type': 'canny',
                    'purpose': 'outfit_edge_preservation',
                }
            }
            self.workflow['nodes'].append(preprocessor_node)
            
            control_input = [preprocessor_id, 0]
        
        # Load ControlNet
        controlnet_loader_id = self._generate_node_id()
        controlnet_loader_node = {
            'id': controlnet_loader_id,
            'class_type': f'ControlNetLoader_{processor_type.title()}',
            'inputs': {
                'controlnet_name': f'{processor_type}.safetensors',
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': processor_type,
            }
        }
        self.workflow['nodes'].append(controlnet_loader_node)
        
        # CLIPTextEncode for clothing conditioning
        clip_encode_id = self._generate_node_id()
        clip_encode_node = {
            'id': clip_encode_id,
            'class_type': 'CLIPTextEncode',
            'inputs': {
                'text': '(clothing outline preserved: 1.2), detailed fabric texture',
                'clip': ['1', 1],
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'outfit_conditioning',
            }
        }
        self.workflow['nodes'].append(clip_encode_node)
        
        # ControlNetApply
        controlnet_apply_id = self._generate_node_id()
        controlnet_apply_node = {
            'id': controlnet_apply_id,
            'class_type': 'ControlNetApply',
            'inputs': {
                'control_net': [controlnet_loader_id],
                'conditioning': [clip_encode_id],
                'image': control_input,
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'outfit_apply',
            }
        }
        self.workflow['nodes'].append(controlnet_apply_node)
        
        self.units.append({
            'type': processor_type,
            'unit_index': unit_id,
            'node_ids': {
                'preprocessor': preprocessor_id,
                'controlnet_loader': controlnet_loader_id,
                'clip_encode': clip_encode_id,
                'controlnet_apply': controlnet_apply_id,
            },
            'config': {
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            }
        })
        
        return self
    
    def add_scene_unit(
        self,
        depth_map: str,
        canny_edge: str = None,
        weight: float = DEFAULT_WEIGHTS['depth'],
        guidance_start: float = DEFAULT_GUIDANCE['start'],
        guidance_end: float = DEFAULT_GUIDANCE['end']
    ):
        """
        Add Depth/Canny ControlNet unit for scene depth control
        
        Args:
            depth_map: URL to MiDaS depth map PNG
            canny_edge: Optional Canny edge for architectural lines
            weight: ControlNet strength (0~1)
            guidance_start: When to start applying ControlNet (0~1)
            guidance_end: When to stop applying ControlNet (0~1)
        """
        unit_id = len(self.units)
        
        # Determine which to use (depth priority)
        if depth_map:
            processor_type = 'depth'
            preprocessor_id = self._generate_node_id()
            preprocessor_node = {
                'id': preprocessor_id,
                'class_type': 'PreProcessor_Depth',
                'inputs': {
                    'image_url': depth_map,
                    'estimator': 'midas',
                },
                '_meta_': {
                    'unit_index': unit_id,
                    'type': 'depth',
                    'purpose': 'scene_depth_control',
                }
            }
            self.workflow['nodes'].append(preprocessor_node)
            control_input = [preprocessor_id, 0]
        elif canny_edge:
            # Fallback to Canny
            return self.add_outfit_unit(canny_edge, weight=weight)
        else:
            raise ValueError("Either depth_map or canny_edge must be provided")
        
        # Load ControlNet
        controlnet_loader_id = self._generate_node_id()
        controlnet_loader_node = {
            'id': controlnet_loader_id,
            'class_type': 'ControlNetLoader_Depth',
            'inputs': {
                'controlnet_name': 'depth.controlnet',
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'depth',
            }
        }
        self.workflow['nodes'].append(controlnet_loader_node)
        
        # CLIPTextEncode for scene conditioning
        clip_encode_id = self._generate_node_id()
        clip_encode_node = {
            'id': clip_encode_id,
            'class_type': 'CLIPTextEncode',
            'inputs': {
                'text': '(proper depth composition: 1.2), environmental atmosphere',
                'clip': ['1', 1],
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'scene_conditioning',
            }
        }
        self.workflow['nodes'].append(clip_encode_node)
        
        # ControlNetApply
        controlnet_apply_id = self._generate_node_id()
        controlnet_apply_node = {
            'id': controlnet_apply_id,
            'class_type': 'ControlNetApply',
            'inputs': {
                'control_net': [controlnet_loader_id],
                'conditioning': [clip_encode_id],
                'image': control_input,
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'scene_apply',
            }
        }
        self.workflow['nodes'].append(controlnet_apply_node)
        
        self.units.append({
            'type': 'depth',
            'unit_index': unit_id,
            'node_ids': {
                'preprocessor': preprocessor_id,
                'controlnet_loader': controlnet_loader_id,
                'clip_encode': clip_encode_id,
                'controlnet_apply': controlnet_apply_id,
            },
            'config': {
                'weight': weight,
                'guidance_start': guidance_start,
                'guidance_end': guidance_end,
            }
        })
        
        return self
    
    def add_identity_unit(
        self,
        face_reference: str,
        weight: float = DEFAULT_WEIGHTS['ipadapter'],
        clip_vision_weight: float = 0.8
    ):
        """
        Add IP-Adapter unit for face identity locking
        
        Inserts:
        - IPAdapterFaceIdentify (extract face features)
        - IPAdapterLoader (load ip-adapter-plus-flux.safetensors)
        - IPAdapterApply (apply to latent conditioning)
        
        Args:
            face_reference: URL to face reference image
            weight: IP-Adapter strength (0~1)
            clip_vision_weight: CLIP vision encoder weight
        """
        unit_id = len(self.units)
        
        # IPAdapterFaceIdentify node
        identify_id = self._generate_node_id()
        identify_node = {
            'id': identify_id,
            'class_type': 'IPAdapterFaceIdentify',
            'inputs': {
                'image': face_reference,
                'face_crop': '[768, 768, 1536, 1536]',  # Central face region
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'identity',
                'purpose': 'face_feature_extraction',
            }
        }
        self.workflow['nodes'].append(identify_node)
        
        # IPAdapterLoader
        loader_id = self._generate_node_id()
        loader_node = {
            'id': loader_id,
            'class_type': 'IPAdapterLoader_Flux',
            'inputs': {
                'ip_adapter_name': 'ip-adapter-plus-flux.safetensors',
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'identity',
            }
        }
        self.workflow['nodes'].append(loader_node)
        
        # IPAdapterApply
        apply_id = self._generate_node_id()
        apply_node = {
            'id': apply_id,
            'class_type': 'IPAdapterApply',
            'inputs': {
                'ip_adapter': [loader_id],
                'features': [identify_id, 0],
                'model': ['2', 0],  # Base UNET model
                'weight': weight,
                'weight_type': 'style transfer',
                'start_at': 0.0,
                'end_at': 1.0,
                'clip_vision_weight': clip_vision_weight,
            },
            '_meta_': {
                'unit_index': unit_id,
                'type': 'identity',
            }
        }
        self.workflow['nodes'].append(apply_node)
        
        self.units.append({
            'type': 'ipadapter',
            'unit_index': unit_id,
            'node_ids': {
                'identify': identify_id,
                'loader': loader_id,
                'apply': apply_id,
            },
            'config': {
                'weight': weight,
                'clip_vision_weight': clip_vision_weight,
            }
        })
        
        return self
    
    def build_connections(self):
        """
        Build internal connections between ControlNet nodes
        This should be called before building the final workflow
        """
        if 'connections' not in self.workflow:
            self.workflow['connections'] = []
        
        # Note: Actual connection building requires knowledge of base workflow structure
        # For now, we return placeholder logic
        pass
    
    def build(self) -> Dict[str, Any]:
        """
        Build and return final ComfyUI workflow
        
        Returns:
            Complete workflow JSON ready to send to ComfyUI worker
        """
        # Add metadata
        if '_meta_' not in self.workflow:
            self.workflow['_meta_'] = {}
        
        self.workflow['_meta_']['controlnet_units'] = len(self.units)
        self.workflow['_meta_']['unit_types'] = [u['type'] for u in self.units]
        
        return self.workflow
    
    def save(self, output_path: Union[str, Path]):
        """Save workflow to file"""
        workflow = self.build()
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(path, 'w') as f:
            json.dump(workflow, f, indent=2)
        
        return path


def build_workflow_from_presets(
    base_workflow_path: str,
    presets: Dict[str, str],
    options: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Convenience function to build workflow from preset names
    
    Args:
        base_workflow_path: Path to base workflow JSON
        presets: {category: preset_slug_or_url}
                   e.g. {'pose': 'dance_v1.json', 'outfit': 'summer.png'}
        options: Additional options for each unit
        
    Returns:
        Built workflow dictionary
    """
    options = options or {}
    
    builder = ControlNetWorkflowBuilder(base_workflow_path)
    
    # Process each preset
    if 'pose' in presets:
        builder.add_pose_unit(
            openpose_json=presets['pose'],
            **options.get('pose_unit', {})
        )
    
    if 'outfit' in presets:
        outfit_config = options.get('outfit_unit', {})
        if 'person_mask' in presets:
            builder.add_outfit_unit(
                canny_edge=presets['outfit'],
                person_mask=presets['person_mask'],
                **outfit_config
            )
        else:
            builder.add_outfit_unit(
                canny_edge=presets['outfit'],
                **outfit_config
            )
    
    if 'scene' in presets:
        builder.add_scene_unit(
            depth_map=presets['scene'],
            **options.get('scene_unit', {})
        )
    
    if 'identity' in presets:
        builder.add_identity_unit(
            face_reference=presets['identity'],
            **options.get('identity_unit', {})
        )
    
    return builder.build()


def main():
    """CLI entry point for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Build ComfyUI workflow with ControlNet multi-unit support'
    )
    parser.add_argument('--base-workflow', required=True, help='Base workflow JSON')
    parser.add_argument('--pose', help='OpenPose JSON URL for pose control')
    parser.add_argument('--outfit', help='Canny edge or outfit image URL')
    parser.add_argument('--mask', help='Person segmentation mask (optional)')
    parser.add_argument('--scene', help='Depth map URL for scene control')
    parser.add_argument('--identity', help='Face reference image for identity lock')
    parser.add_argument('--output', '-o', required=True, help='Output workflow path')
    parser.add_argument('--weights', nargs='*', default=['0.8', '0.8', '0.8', '0.8'])
    
    args = parser.parse_args()
    
    weights = iter(args.weights)
    
    builder = ControlNetWorkflowBuilder(args.base_workflow)
    
    if args.pose:
        try:
            w = next(weights)
            builder.add_pose_unit(openpose_json=args.pose, weight=float(w))
        except StopIteration:
            builder.add_pose_unit(openpose_json=args.pose)
    
    if args.outfit:
        try:
            w = next(weights)
            if args.mask:
                builder.add_outfit_unit(canny_edge=args.outfit, person_mask=args.mask, weight=float(w))
            else:
                builder.add_outfit_unit(canny_edge=args.outfit, weight=float(w))
        except StopIteration:
            if args.mask:
                builder.add_outfit_unit(canny_edge=args.outfit, person_mask=args.mask)
            else:
                builder.add_outfit_unit(canny_edge=args.outfit)
    
    if args.scene:
        try:
            w = next(weights)
            builder.add_scene_unit(depth_map=args.scene, weight=float(w))
        except StopIteration:
            builder.add_scene_unit(depth_map=args.scene)
    
    if args.identity:
        try:
            w = next(weights)
            builder.add_identity_unit(face_reference=args.identity, weight=float(w))
        except StopIteration:
            builder.add_identity_unit(face_reference=args.identity)
    
    builder.save(args.output)
    print(f"Built workflow with {len(builder.units)} ControlNet units -> {args.output}")


if __name__ == '__main__':
    main()
