import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Route_permission_map } from './route_permission_map.entity';

@Entity('setting_definition')
export class Setting_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "boolean", nullable: false, default: false })
    isInit: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "text", nullable: true })
    projectDescription: string;
    @Column({ type: "varchar", nullable: true })
    projectName: string;
    @Column({ type: "varchar", nullable: true })
    projectUrl: string;
    @OneToMany('Route_permission_map', (rel: any) => rel.setting, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    actionPermissionValue: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
