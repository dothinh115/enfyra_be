import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Setting_definition } from './setting_definition.entity';

@Entity('route_permission_map')
@Unique(['action', 'method'])
export class Route_permission_map {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: false })
    action: string;
    @Column({ type: "varchar", nullable: false })
    method: string;
    @ManyToOne('Setting_definition', (rel: any) => rel.actionPermissionValue, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    setting: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
