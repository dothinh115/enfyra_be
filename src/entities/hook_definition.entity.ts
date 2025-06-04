import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("hook_definition")
export class Hook_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false, default: "GET"})
  method: string;

  @Column({type:'varchar', nullable: false})
  path: string;

  @Column({type:'text', nullable: false})
  handler: string;

  @Column({type:'varchar', nullable: false, default: "beforeHandler"})
  type: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}